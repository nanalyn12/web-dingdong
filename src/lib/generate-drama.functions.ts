import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { assertEditor } from "@/lib/courses.functions";

const LevelEnum = z.enum(["beginner", "intermediate", "advanced"]);
const LangEnum = z.enum(["auto", "zh-CN", "zh-TW", "en"]);

const Input = z.object({
  youtubeUrl: z.string().url(),
  title: z.string().optional().default(""),
  level: LevelEnum,
  genre: z.string().optional().default(""),
  lang: LangEnum.optional().default("auto"),
});

// Extract YouTube video id from common URL formats.
function extractVideoId(url: string): string | null {
  const m =
    url.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    url.match(/youtube\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function fetchOEmbed(url: string): Promise<{
  title?: string;
  thumbnail_url?: string;
}> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    );
    if (!res.ok) return {};
    return (await res.json()) as { title?: string; thumbnail_url?: string };
  } catch {
    return {};
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const s = trimmed.indexOf("{");
  const e = trimmed.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error(`JSON 객체를 찾지 못함: ${trimmed.slice(0, 400)}`);
  return JSON.parse(trimmed.slice(s, e + 1));
}

function buildPrompt(args: {
  level: "beginner" | "intermediate" | "advanced";
  genre: string;
}) {
  const levelKo =
    args.level === "beginner"
      ? "입문 (HSK 1~3급)"
      : args.level === "intermediate"
        ? "중급 (HSK 4~6급)"
        : "고급 (HSK 7~9급)";
  return `너는 한국인 성인 중국어 학습자를 위한 드라마 학습 콘텐츠 디자이너야.
첨부된 YouTube 영상(중국어 드라마/콘텐츠)을 시청한 뒤, 학습용 장면(scene) 4~8개로 분할하고 각 장면별 학습 자료를 만들어줘.
난이도: ${levelKo}${args.genre ? `\n장르: ${args.genre}` : ""}

[필수 규칙]
- 모든 중국어는 简体(간체) 한자로만.
- zh 필드에 한글/병음 섞지 마.
- 타임코드는 실제 영상 기준 초 단위 정수.
- 각 scene은 30초~3분 사이를 권장.
- 장면이 너무 적으면(짧은 영상) 4개, 정보가 풍부하면 최대 8개.

응답은 아래 JSON 한 객체만 출력 (코드펜스/설명 금지):
{
  "title": "전체 한국어 학습 제목 (15자 이내)",
  "title_zh": "中文 제목 (선택)",
  "description": "한국어 한 줄 소개",
  "duration_seconds": 영상 전체 길이(추정 정수),
  "scenes": [
    {
      "index": 1,
      "title": "한국어 장면 제목 (12자 이내)",
      "start_seconds": 0,
      "end_seconds": 65,
      "summary_ko": "이 장면에서 일어나는 일 (2~3문장)",
      "key_lines": [
        { "zh": "...", "pinyin": "...", "ko": "...", "speaker": "여자/남자/이름", "time_seconds": 12 }
      ],   // 핵심 대사 5~8개 (자막 있으면 time_seconds 필수)

      "vocab": [
        { "zh": "...", "pinyin": "...", "ko": "...", "emoji": "🍜", "hsk": 3 }
      ],   // 핵심 단어/표현 4~6개
      "culture_tip": { "title": "...", "body": "..." },
      "quiz": [
        { "type": "choice", "question": "...", "options": ["A","B","C","D"], "answer": "B", "explanation": "..." },
        { "type": "fill", "question": "我___中文。", "answer": "学", "explanation": "..." }
      ]   // 미니 퀴즈 2~3개 (장면 내용 기반)
    }
  ]
}`;
}

export type GenerateSceneResult = {
  videoId: string;
  oembed: { title?: string; thumbnail_url?: string };
  hasCaptions: boolean;
  parsed: {
    title?: string;
    title_zh?: string;
    description?: string;
    duration_seconds?: number;
    scenes: unknown[];
  };
};

// Core: fetch captions, prompt Gemini, return parsed scene data.
// Reused by create (generateDrama) and resync (resyncDramaCaptions).
export async function generateSceneData(args: {
  youtubeUrl: string;
  level: "beginner" | "intermediate" | "advanced";
  genre: string;
  title?: string;
  lang?: "auto" | "zh-CN" | "zh-TW" | "en";
}): Promise<GenerateSceneResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const videoId = extractVideoId(args.youtubeUrl);
  if (!videoId) throw new Error("올바른 YouTube URL이 아닙니다.");

  const oembed = await fetchOEmbed(args.youtubeUrl);

  // Fetch captions. If none exist, we abort — we don't want the AI to
  // hallucinate dialogue and timestamps that don't match the real video.
  const { fetchYouTubeCaptions } = await import("./youtube-captions.server");
  let caps: Awaited<ReturnType<typeof fetchYouTubeCaptions>> = null;
  try {
    caps = await fetchYouTubeCaptions(videoId, args.lang ?? "auto");
  } catch {
    caps = null;
  }
  if (!caps || caps.segments.length === 0) {
    throw new Error(
      "이 영상은 서버에서 자막을 가져올 수 없어요 (YouTube가 빈 응답을 반환하거나 자막이 없는 영상입니다). 자막이 있는 다른 영상으로 시도해주세요.",
    );
  }
  const hasCaptions = true;
  const isChineseCaptions = /^zh/i.test(caps.languageCode);
  const segs = caps.segments.slice(0, 400);
  const captionsBlock =
    `\n\n[실제 자막 트랙 — 이 timestamp를 반드시 그대로 사용]\n` +
    `언어: ${caps.languageCode}${
      isChineseCaptions
        ? " (원문 중국어)"
        : " (번역 자막 — 타임스탬프는 실제 발화 시점과 동일)"
    }\n` +
    segs.map((s) => `${s.start.toFixed(1)}: ${s.text}`).join("\n");

  const captionRule = isChineseCaptions
    ? `\n\n[절대 규칙 — 위반 시 응답 무효]
1) 각 scene의 start_seconds / end_seconds는 반드시 위 자막 라인의 실제 start 값(초) 중에서 골라. 자막에 없는 시각은 절대 만들지 마.
2) 각 key_line의 "zh"는 위 자막에 실제로 등장한 문장을 그대로 (또는 자연스러운 간체로) 사용해. 자막에 없는 대사는 절대 창작하지 마.
3) 각 key_line의 "time_seconds"는 그 문장이 등장한 자막 라인의 start 값(정수 초)이어야 해.
4) YouTube URL은 참고용으로 제공됨. 필요하면 영상을 시청해서 문맥/화자를 파악해도 되지만, 대사와 시각은 위 자막만 정답으로 삼아.`
    : `\n\n[절대 규칙 — 위반 시 응답 무효]
1) 위 자막은 원어(중국어) 발화의 번역본이야. Timestamp는 실제 발화 시점과 정확히 일치해.
2) 각 scene의 start_seconds / end_seconds와 각 key_line의 time_seconds는 반드시 위 자막 라인의 실제 start 값(초) 중에서 골라. 자막에 없는 시각은 절대 만들지 마.
3) 각 key_line의 "zh"는 해당 시각의 번역 문장을 자연스러운 중국어 원문(간체, 구어 대사)으로 복원해서 써. "ko"는 한국어 번역.
4) 자막에 없는 대사/시각은 절대 창작하지 마. 자막 라인 수만큼만 대사를 뽑아.
5) YouTube URL이 함께 제공돼. 가능하면 영상을 시청해서 실제 원문 발화를 확인하고 "zh"를 더 정확하게 복원해줘. 단, timestamp/대사 존재 여부는 위 자막이 정답.`;

  const promptText =
    buildPrompt({ level: args.level, genre: args.genre }) +
    `\n\n[참고 정보]\nYouTube URL: ${args.youtubeUrl}` +
    (oembed.title ? `\n영상 제목: ${oembed.title}` : "") +
    (args.title ? `\n사용자가 지정한 제목: ${args.title}` : "") +
    captionsBlock +
    captionRule;

  // Note: we intentionally send captions as the primary source. The Lovable
  // AI gateway (OpenAI-compatible) doesn't accept YouTube URL as a native
  // video part, so we surface the URL prominently in the prompt and let
  // Gemini fetch it when the model chooses to.
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [{ role: "user", content: [{ type: "text", text: promptText }] }],
      temperature: 0.2,
      max_tokens: 16384,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI 요청 한도를 잠깐 초과했어요. 30초~1분 후 다시 시도해주세요. (429)");
    if (res.status === 402) throw new Error("AI 크레딧이 소진되었습니다. 관리자에게 크레딧 충전을 요청해주세요. (402)");
    if (res.status === 408 || res.status === 504) throw new Error("AI 응답이 너무 오래 걸려요. 영상이 너무 긴 경우일 수 있어요.");
    if (res.status >= 500) throw new Error(`AI 서버가 일시적으로 불안정해요. (${res.status})`);
    if (res.status === 400) throw new Error(`AI가 이 영상을 분석하지 못했어요. (400) ${errText.slice(0, 200)}`);
    throw new Error(`AI 호출 실패 (${res.status}): ${errText.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { completion_tokens?: number; prompt_tokens?: number };
  };
  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? "";
  const finish = choice?.finish_reason;
  if (!text) {
    console.error("[generate-drama] Empty AI response", {
      finish_reason: finish,
      usage: json.usage,
    });
    if (finish === "length" || finish === "MAX_TOKENS") {
      throw new Error(
        "AI 응답이 최대 길이를 초과했어요 (thinking 토큰이 예산을 다 씀). 영상이 너무 길거나 자막이 많은 경우예요 — 더 짧은 영상으로 시도해주세요.",
      );
    }
    throw new Error(`AI 응답이 비어 있습니다. (finish_reason=${finish ?? "unknown"})`);
  }
  let parsed: GenerateSceneResult["parsed"];
  try {
    parsed = extractJson(text) as GenerateSceneResult["parsed"];
  } catch (e) {
    throw new Error(`AI 응답 파싱 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  if (scenes.length === 0) throw new Error("AI가 장면을 만들지 못했어요.");
  parsed.scenes = scenes;
  return { videoId, oembed, hasCaptions, parsed };
}

export const generateDrama = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { videoId, oembed, hasCaptions, parsed } = await generateSceneData({
      youtubeUrl: data.youtubeUrl,
      level: data.level,
      genre: data.genre,
      title: data.title,
      lang: data.lang,
    });
    const finalTitle =
      (data.title?.trim() || parsed.title || oembed.title || "드라마 학습").slice(0, 80);

    const { db, tables } = await import("@/db");
    const [row] = await db
      .insert(tables.dramas)
      .values({
        title: finalTitle,
        title_zh: parsed.title_zh ?? null,
        description: parsed.description ?? null,
        level: data.level,
        youtube_url: data.youtubeUrl,
        youtube_video_id: videoId,
        thumbnail_url:
          oembed.thumbnail_url ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        duration_seconds: parsed.duration_seconds ?? null,
        genre: data.genre || null,
        scenes: parsed.scenes as unknown as import("@/db/schema").Json,
        has_captions: hasCaptions,
        created_by: context.userId,
      })
      .returning({ id: tables.dramas.id });
    return { dramaId: row.id };
  });

