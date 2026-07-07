import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { assertEditor } from "./courses.functions";

// ---------- Input ----------
const LevelEnum = z.enum(["beginner", "intermediate", "advanced"]);

const InputSchema = z.object({
  courseId: z.string().uuid(),
  courseName: z.string().min(1),
  lessonTitle: z.string().optional().default(""),
  level: LevelEnum,
});

// ---------- Output (Gemini responseSchema, via AI SDK Output.object) ----------
// Keep the provider-side schema intentionally shallow. Gemini can satisfy this
// reliably, while the detailed field rules remain in the prompt and JSONB can
// store the richer nested structures without local validation failures.
const JsonObject = z.looseObject({});
const ObjectOrString = z.union([JsonObject, z.string()]);

const LessonSchema = z.object({
  title: z.string().default(""),
  content: z.string().default(""),
  key_expressions: z.array(JsonObject).default([]),
  cultural_note: ObjectOrString.default({}),
  dialogue_scene: z.string().default(""),
  comic_panels: z.array(JsonObject).default([]),
  dialogues: z.array(JsonObject).default([]),
  video_keywords: z.array(z.string()).default([]),
  slides: z.array(JsonObject).default([]),
  quiz: z.array(JsonObject).default([]),
  storybook_pages: z.array(JsonObject).default([]),
  vocab_comparison: z.array(JsonObject).default([]),
  cultural_snippet: ObjectOrString.default({}),
});

function coerceObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("{")) {
      try { return JSON.parse(s); } catch { /* fall through */ }
    }
    return { text: v };
  }
  return {};
}

function normalizeLesson(raw: z.infer<typeof LessonSchema>) {
  return {
    title: (raw.title || "").trim(),
    content: raw.content || "",
    key_expressions: Array.isArray(raw.key_expressions) ? raw.key_expressions : [],
    cultural_note: coerceObject(raw.cultural_note),
    dialogue_scene: raw.dialogue_scene || "",
    comic_panels: Array.isArray(raw.comic_panels) ? raw.comic_panels : [],
    dialogues: Array.isArray(raw.dialogues) ? raw.dialogues : [],
    video_keywords: Array.isArray(raw.video_keywords) ? raw.video_keywords : [],
    slides: Array.isArray(raw.slides) ? raw.slides : [],
    quiz: Array.isArray(raw.quiz) ? raw.quiz : [],
    storybook_pages: Array.isArray(raw.storybook_pages) ? raw.storybook_pages : [],
    vocab_comparison: Array.isArray(raw.vocab_comparison) ? raw.vocab_comparison : [],
    cultural_snippet: coerceObject(raw.cultural_snippet),
  };
}

const toJson = (value: unknown): Json => value as Json;

function extractJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`JSON 객체를 찾지 못했습니다. 응답 앞부분: ${trimmed.slice(0, 500)}`);
  }
  const jsonText = trimmed.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`JSON 파싱 실패: ${msg}. 응답 앞부분: ${jsonText.slice(0, 500)}`);
  }
}

// ---------- Prompt ----------
function buildPrompt(args: {
  courseName: string;
  lessonTitle: string;
  level: "beginner" | "intermediate" | "advanced";
  existingTitles: string[];
  nextOrder: number;
}) {
  const levelKo =
    args.level === "beginner"
      ? "입문 (HSK 1~3급)"
      : args.level === "intermediate"
        ? "중급 (HSK 4~6급)"
        : "고급 (HSK 7~9급)";

  const pinyinRule =
    args.level === "beginner"
      ? "본문(content)·실전대화(dialogues)·comic_panels·storybook_pages 등 모든 중국어 문장에 pinyin 표기를 포함하세요."
      : "본문(content)과 실전대화(dialogues), comic_panels, storybook_pages의 중국어 문장에는 pinyin을 절대 포함하지 마세요 (한자와 한국어 번역만). 단 key_expressions, slides.vocab/examples/practice 등 구조화된 어휘·예문 필드의 pinyin 필드는 채워주세요.";

  const hasTitle = args.lessonTitle.trim().length > 0;
  const titleBlock = hasTitle
    ? `강의 제목: ${args.lessonTitle}\n(title 필드에도 위 제목을 그대로 넣으세요.)`
    : `강의 제목: (없음 — 직접 생성)\n[title 생성 규칙]\n- 강좌명/난이도/이전 강의 흐름을 고려해 ${args.nextOrder}번째 세부 강의에 어울리는 한국어 제목을 만드세요.\n- 12자 이내, 부제·따옴표·번호 금지, 학습 주제가 한눈에 보이게.\n- 이전 강의 제목과 겹치거나 비슷하지 않게.`;

  const prevList =
    args.existingTitles.length > 0
      ? `이전 세부 강의 제목 목록:\n${args.existingTitles.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}`
      : "이전 세부 강의 없음 (첫 번째 강의).";

  return `강좌명: ${args.courseName}
난이도: ${levelKo}
이번 차시: ${args.nextOrder}번째 세부 강의
${prevList}

${titleBlock}

아래 규칙을 정확히 따라 강의 콘텐츠를 JSON으로 생성하세요. JSON 외의 텍스트는 출력 금지.
최상위 JSON 키는 반드시 title, content, key_expressions, cultural_note, dialogue_scene, comic_panels, dialogues, video_keywords, slides, quiz, storybook_pages, vocab_comparison, cultural_snippet 만 사용하세요.

[전역 필수 규칙]
- 모든 중국어는 반드시 简体中文(간체) 한자로만 작성. 번체/병음으로 zh 필드를 채우지 말 것.
- zh 필드에는 한자만, 한국어는 ko 필드에만. zh 필드에 한글이 들어가면 오류.
- image_prompt / dialogue_scene 은 영어로 작성하고 반드시 "No text, no characters" 문구 포함.
- AI 친구 캐릭터 이름은 반드시 "叮叮" (다른 이름 금지).
- 어휘/문법 난이도는 ${levelKo} 수준에 맞출 것.
- ${pinyinRule}

[content 작성 규칙]
- 마크다운 형식 (##, ###, **, - 사용)
- 구조: ## 도입 → ## 핵심 표현 → ## 문법 포인트 → ## 실전 대화 → ## 문화 속 언어
- 중국어 예문마다 한국어 번역 필수
- 핵심 표현은 **굵게**, 표현마다 의미 설명 1-2문장 + 예시 문장 2개
- 문법 포인트는 설명 + 예문 2-3개 (별도 줄)
- 최소 500자

[key_expressions] 6-9개. 각 항목 zh(한자)/pinyin/ko/hsk(1-9) 필수. emoji(단어 의미를 직관적으로 표현하는 이모지 1개) 필수.
[cultural_note] 위 스펙대로 풍부하게.
[dialogue_scene] 영어 한 문단 (실전 대화 장면 묘사 + "No text, no characters").
[comic_panels] 정확히 4개. 캐릭터는 지수(한국인 학습자) + 叮叮(중국인 친구). 각 패널 narration(한국어)/lines(zh/pinyin/ko/speaker)/image_prompt(영어, "No text, no characters") 필수.
[dialogues] 8-10개. content의 "## 실전 대화"와 동일한 내용을 구조화. speaker/zh(한자)/pinyin/ko.
[video_keywords] 정확히 2개. 1번 한국어, 2번 중국어. 영어 금지.
[slides] 정확히 5장. 각 슬라이드는 반드시 다음 필드를 모두 포함하세요: title(한국어 제목, 12자 이내), subtitle(한 줄 한국어 부제), key_point(핵심 한 문장), content(마크다운 본문 — ###, **, - 사용, 중국어는 반드시 한자로, 예문엔 한국어 번역 병기, 최소 120자), tip(학습 팁 한 문장), image_prompt(영어 + "No text, no characters"). 가능하면 vocab(zh/pinyin/ko 3~5개) 또는 examples(zh/pinyin/ko 2~3개) 중 주제에 맞는 쪽을 추가하세요. 주제 순서: ① 도입/개요 ② 핵심 표현 ③ 문법 포인트 ④ 실전 활용 ⑤ 정리/복습.
[quiz] 정확히 6개. choice 2 + fill 2 + order 2.
[storybook_pages] 정확히 6페이지. 캐릭터 지수 중심. image_prompt는 영어 + "No text, no characters" + watercolor storybook 스타일.
[vocab_comparison] 2-3개.
[cultural_snippet] 1개.`;
}

// ---------- Server Function ----------
export const generateLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Fetch existing lesson titles in order for context + next order_index.
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("lessons")
      .select("title, order_index")
      .eq("course_id", data.courseId)
      .order("order_index", { ascending: true });
    if (existingErr) throw new Error(existingErr.message);
    const existingTitles = (existing ?? []).map((r) => r.title);
    const nextOrder =
      ((existing ?? []).reduce((m, r) => Math.max(m, r.order_index), 0)) + 1;

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");

    const system =
      "You are an expert Chinese-language curriculum designer creating lessons for Korean adult learners. Always respect the user's formatting and language rules. Output simplified Chinese (简体) only.";

    let parsed: ReturnType<typeof normalizeLesson>;
    try {
      const result = await generateText({
        model,
        system,
        prompt: buildPrompt({
          courseName: data.courseName,
          lessonTitle: data.lessonTitle,
          level: data.level,
          existingTitles,
          nextOrder,
        }),
        maxOutputTokens: 32000,
        temperature: 0.4,
      });
      parsed = normalizeLesson(LessonSchema.parse(extractJsonObject(result.text)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = /429|rate.?limit|quota/i.test(msg)
        ? "Gemini 요청 한도를 초과했어요. 1~2분 후 다시 시도해주세요."
        : /402|credit|insufficient/i.test(msg)
          ? "AI 크레딧이 부족해요. 충전 후 다시 시도해주세요."
          : /401|unauthor|api.?key/i.test(msg)
            ? "Gemini API 키 인증 실패. LOVABLE_API_KEY 시크릿을 확인해주세요."
            : /timeout|ETIMEDOUT|ECONNRESET/i.test(msg)
              ? "AI 응답 대기 시간이 초과되었어요. 다시 시도해주세요."
              : /JSON|parse|extract/i.test(msg)
                ? `AI 응답 형식 오류 — ${msg}`
                : msg;
      throw new Error(`강의 생성 실패 — ${friendly}`);
    }

    const finalTitle =
      (data.lessonTitle?.trim() || parsed.title || `${nextOrder}차시 학습`).slice(
        0,
        80,
      );

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("lessons")
      .insert({
        course_id: data.courseId,
        created_by: context.userId,
        order_index: nextOrder,
        title: finalTitle,
        lesson_type: "ai_generated",
        level: data.level,
        content_md: parsed.content,
        key_expressions: toJson(parsed.key_expressions),
        cultural_note: toJson(parsed.cultural_note),
        dialogues: toJson(parsed.dialogues),
        slides: toJson(parsed.slides),
        quiz: toJson(parsed.quiz),
        comic_panels: toJson(parsed.comic_panels),
        storybook_pages: toJson(parsed.storybook_pages),
        video: toJson({ keywords: parsed.video_keywords }),
        dialogue_scene: parsed.dialogue_scene,
        video_keywords: toJson(parsed.video_keywords),
        vocab_comparison: toJson(parsed.vocab_comparison),
        cultural_snippet: toJson(parsed.cultural_snippet),
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return { lessonId: inserted.id as string };
  });

