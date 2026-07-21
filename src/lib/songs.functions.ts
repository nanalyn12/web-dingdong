import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { createTextProvider } from "@/lib/ai-gateway.server";
import { assertEditor } from "@/lib/courses.functions";
import type { Json } from "@/db/schema";

const LevelEnum = z.enum(["beginner", "intermediate", "advanced"]);

const LyricLineSchema = z.object({
  zh: z.string().min(1),
  pinyin: z.string().optional().default(""),
  ko: z.string().optional().default(""),
  time: z.number().nonnegative().optional(),
});

const CreateSongInput = z.object({
  title: z.string().min(1),
  title_zh: z.string().optional().default(""),
  level: LevelEnum,
  cover_url: z.string().url().optional().or(z.literal("")).default(""),
  media_url: z.string().min(1, "미디어 URL은 필수"),
  lyrics: z.array(LyricLineSchema).default([]),
});

export type LyricLine = z.infer<typeof LyricLineSchema>;

export type VocabItem = {
  zh: string;
  pinyin: string;
  ko: string;
  example?: string;
};

export type GrammarNote = {
  title: string;
  zh_example: string;
  pinyin?: string;
  ko: string;
  explanation: string;
};

export type SongRow = {
  id: string;
  title: string;
  title_zh: string | null;
  level: "beginner" | "intermediate" | "advanced";
  cover_url: string | null;
  media_url: string | null;
  video_url: string | null;
  lyrics: LyricLine[];
  vocab: VocabItem[];
  grammar_notes: GrammarNote[];
  status: string;
  style: string | null;
  topic: string | null;
  suno_audio_task_id: string | null;
  suno_audio_id: string | null;
  suno_mp4_task_id: string | null;
  source: "suno" | "curated";
  external_url: string | null;
  youtube_id: string | null;
  artist: string | null;
  pinyin: string[];
  translation: string[];
  created_at: string;
};

async function fetchSong(songId: string): Promise<SongRow> {
  const { db, tables } = await import("@/db");
  const rows = await db
    .select()
    .from(tables.songs)
    .where(eq(tables.songs.id, songId))
    .limit(1);
  if (!rows[0]) throw new Error("노래를 찾을 수 없습니다.");
  return rows[0] as unknown as SongRow;
}

async function updateSong(
  songId: string,
  patch: Record<string, unknown>,
): Promise<SongRow> {
  const { db, tables } = await import("@/db");
  const [row] = await db
    .update(tables.songs)
    .set(patch)
    .where(eq(tables.songs.id, songId))
    .returning();
  return row as unknown as SongRow;
}

export const listSongs = createServerFn({ method: "GET" }).handler(
  async (): Promise<SongRow[]> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.songs)
      .orderBy(desc(tables.songs.created_at));
    return rows as unknown as SongRow[];
  },
);

export const getSong = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<SongRow> => fetchSong(data.id));

export const createSong = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => CreateSongInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const [row] = await db
      .insert(tables.songs)
      .values({
        title: data.title,
        title_zh: data.title_zh || null,
        level: data.level,
        cover_url: data.cover_url || null,
        media_url: data.media_url,
        lyrics: data.lyrics as unknown as Json,
        status: "ready",
        created_by: context.userId,
      })
      .returning({ id: tables.songs.id });
    return { songId: row.id };
  });

// ──────────────────────────────────────────────────────────────────────────
// Suno-powered song generation
// ──────────────────────────────────────────────────────────────────────────

const GenerateWithSunoInput = z.object({
  title: z.string().min(1),
  title_zh: z.string().optional().default(""),
  level: LevelEnum,
  style: z.string().min(1, "스타일은 필수입니다 (예: cute k-pop, mandarin pop)"),
  topic: z.string().optional().default(""),
  lyrics: z.string().min(10, "가사 본문이 너무 짧습니다"),
  parsedLyrics: z.array(LyricLineSchema).default([]),
  vocalGender: z.enum(["m", "f"]).optional(),
  model: z
    .enum(["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5", "V5_5"])
    .optional()
    .default("V4_5"),
});

export const generateSongWithSuno = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => GenerateWithSunoInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { sunoCreateMusic } = await import("@/lib/suno.server");
    const { db, tables } = await import("@/db");

    let taskId: string;
    try {
      const res = await sunoCreateMusic({
        title: data.title_zh || data.title,
        style: data.style,
        prompt: data.lyrics,
        model: data.model,
        vocalGender: data.vocalGender,
      });
      taskId = res.taskId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Suno 요청 실패";
      const retryable = /429|한도|초과|점검|5\d\d/.test(msg);
      return {
        error: retryable
          ? "Suno 서버가 지금 바빠요 (요청 한도 초과). 1~2분 후 다시 시도해주세요."
          : msg,
        retryable,
      } as const;
    }

    // Safety net: if parsedLyrics have no pinyin/ko yet, annotate now.
    let finalLyrics = data.parsedLyrics;
    const needsAnn =
      finalLyrics.length > 0 &&
      finalLyrics.every((l) => !l.pinyin?.trim() && !l.ko?.trim());
    if (needsAnn) {
      const ann = await annotateLyricsInternal(finalLyrics.map((l) => l.zh));
      if (!ann.error) {
        finalLyrics = finalLyrics.map((l, i) => ({
          ...l,
          pinyin: ann.pinyin[i] || "",
          ko: ann.ko[i] || "",
        }));
      }
    }

    try {
      const [row] = await db
        .insert(tables.songs)
        .values({
          title: data.title,
          title_zh: data.title_zh || null,
          level: data.level,
          style: data.style,
          topic: data.topic || null,
          lyrics: finalLyrics as unknown as Json,
          status: "generating_audio",
          suno_audio_task_id: taskId,
          created_by: context.userId,
        })
        .returning({ id: tables.songs.id });
      return { songId: row.id, taskId } as const;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "DB insert 실패";
      return { error: msg, retryable: false } as const;
    }
  });

// Poll Suno music task. Once SUCCESS, copy audio + cover onto the media disk
// and update the row with permanent URLs. Idempotent.
export const pollSongGeneration = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ songId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SongRow> => {
    await assertEditor(context.userId);
    const row = await fetchSong(data.songId);
    return advanceSongAudio(row);
  });

/** Advance a song whose audio is still generating (Suno poll → complete).
 * No auth — used by both the client poller and the background scheduler.
 * Returns the (possibly updated) row; throws on a hard Suno failure. */
export async function advanceSongAudio(row: SongRow): Promise<SongRow> {
    const { sunoGetMusic, downloadAndStore } = await import("@/lib/suno.server");

    // Already finished — return as-is.
    if (row.status === "ready" || row.status === "failed_audio") return row;
    if (!row.suno_audio_task_id) {
      throw new Error("Suno taskId가 비어 있습니다.");
    }

    const rec = await sunoGetMusic(row.suno_audio_task_id);

    const AUDIO_FAIL_HINT: Record<string, string> = {
      CREATE_TASK_FAILED: "Suno 작업 생성에 실패했어요. 가사/스타일 값을 확인해주세요.",
      GENERATE_AUDIO_FAILED: "Suno 음원 합성이 실패했어요. 가사가 너무 길거나 모델 한도 문제일 수 있어요.",
      SENSITIVE_WORD_ERROR: "가사에 Suno가 거부한 민감 표현이 포함되었어요. 단어를 바꿔 다시 시도해주세요.",
      CALLBACK_EXCEPTION: "Suno 콜백 처리 중 예외가 발생했어요. 잠시 후 다시 시도해주세요.",
    };
    if (
      rec.status === "CREATE_TASK_FAILED" ||
      rec.status === "GENERATE_AUDIO_FAILED" ||
      rec.status === "SENSITIVE_WORD_ERROR" ||
      rec.status === "CALLBACK_EXCEPTION"
    ) {
      await updateSong(row.id, { status: "failed_audio" });
      const hint = AUDIO_FAIL_HINT[rec.status];
      const detail = rec.errorMessage ? ` — ${rec.errorMessage}` : "";
      throw new Error(`${hint ?? `Suno 생성 실패: ${rec.status}`}${detail}`);
    }

    if (rec.status !== "SUCCESS" && rec.status !== "FIRST_SUCCESS") {
      // Still in progress.
      return row;
    }

    const track = rec.response?.sunoData?.[0];
    // Suno returns camelCase (audioUrl/imageUrl); tolerate snake_case too.
    const audioUrl = track?.audioUrl ?? track?.audio_url;
    const imageUrl = track?.imageUrl ?? track?.image_url;
    if (!track || !audioUrl) {
      return row; // Wait for audio URL to appear (FIRST_SUCCESS may precede it).
    }

    // Copy assets onto the persistent disk.
    const base = `songs/${row.id}/${track.id}`;
    const audio = await downloadAndStore(
      audioUrl,
      `${base}.mp3`,
      "audio/mpeg",
    );
    let coverUrl: string | null = row.cover_url;
    if (imageUrl) {
      try {
        const cover = await downloadAndStore(
          imageUrl,
          `${base}.jpg`,
          "image/jpeg",
        );
        coverUrl = cover.url;
      } catch (e) {
        console.warn("[suno] cover copy failed:", e);
      }
    }

    // Auto-generate lesson content (vocab + grammar notes) on first success.
    // Failures are non-fatal; the song still transitions to `ready`.
    let lessonPatch: { vocab?: VocabItem[]; grammar_notes?: GrammarNote[] } = {};
    try {
      const hasVocab = Array.isArray(row.vocab) && row.vocab.length > 0;
      const hasNotes =
        Array.isArray(row.grammar_notes) && row.grammar_notes.length > 0;
      if (!hasVocab || !hasNotes) {
        lessonPatch = await buildSongLessonContent({
          title: row.title,
          titleZh: row.title_zh,
          level: row.level,
          lyrics: row.lyrics,
        });
      }
    } catch (e) {
      console.warn("[song lesson] auto-generate failed:", e);
    }

    // Auto-kickoff MP4 generation right after audio is ready.
    // Failures here are non-fatal — audio still becomes usable; user can retry MP4.
    let mp4Patch: { suno_mp4_task_id?: string; status?: string } = {
      status: "ready",
    };
    try {
      const { sunoCreateMp4 } = await import("@/lib/suno.server");
      const mp4 = await sunoCreateMp4({
        taskId: row.suno_audio_task_id,
        audioId: track.id,
        author: "DingDong",
        domainName: "dingdong.lms",
      });
      mp4Patch = {
        suno_mp4_task_id: mp4.taskId,
        status: "generating_video",
      };
    } catch (e) {
      console.warn("[suno] auto MP4 kickoff failed:", e);
      // Keep status = ready so audio playback still works; editor can retry.
    }

    return updateSong(row.id, {
      media_url: audio.url,
      cover_url: coverUrl,
      suno_audio_id: track.id,
      ...lessonPatch,
      ...mp4Patch,
    });
}

// ──────────────────────────────────────────────────────────────────────────
// Lesson content (vocab + grammar notes) — AI-generated per song
// ──────────────────────────────────────────────────────────────────────────

const VocabSchema = z.object({
  zh: z.string().min(1),
  pinyin: z.string().default(""),
  ko: z.string().default(""),
  example: z.string().optional().default(""),
});

const GrammarSchema = z.object({
  title: z.string().min(1),
  zh_example: z.string().min(1),
  pinyin: z.string().optional().default(""),
  ko: z.string().default(""),
  explanation: z.string().default(""),
});

const LessonSchema = z.object({
  vocab: z.array(VocabSchema),
  grammar_notes: z.array(GrammarSchema),
});

async function buildSongLessonContent(args: {
  title: string;
  titleZh: string | null;
  level: "beginner" | "intermediate" | "advanced";
  lyrics: LyricLine[];
}): Promise<{ vocab: VocabItem[]; grammar_notes: GrammarNote[] }> {

  const targets = {
    beginner: { vocab: 6, grammar: 3 },
    intermediate: { vocab: 8, grammar: 4 },
    advanced: { vocab: 10, grammar: 5 },
  }[args.level];

  const lyricsText = args.lyrics
    .map((l) => l.zh)
    .filter(Boolean)
    .join("\n");

  const { generateText, Output } = await import("ai");
  const gateway = createTextProvider();
  const model = gateway("google/gemini-3-flash-preview");

  const systemMsg =
    "당신은 한국인 학습자를 위한 중국어 노래 교사입니다. 반드시 지정된 JSON 스키마로만 응답하세요.";
  const prompt = [
    `곡 제목: ${args.title}${args.titleZh ? ` (${args.titleZh})` : ""}`,
    `학습자 레벨: ${args.level}`,
    `가사(한자):\n${lyricsText}`,
    "",
    `아래 규칙을 지켜서 학습 콘텐츠를 만들어주세요.`,
    `1) vocab: 가사에서 학습 가치가 높은 핵심 단어 정확히 ${targets.vocab}개. 각 항목은 { zh(한자), pinyin(성조 기호 포함), ko(간결한 한국어 뜻), example(가사 속 짧은 예문 또는 실용 예문) }.`,
    `2) grammar_notes: 가사에 등장하는 유용한 문법/표현 포인트 정확히 ${targets.grammar}개. 각 항목은 { title(포인트 이름, 예: "了의 완료 용법"), zh_example(짧은 중국어 예문), pinyin, ko(예문 번역), explanation(2~3문장 한국어 설명) }.`,
    `3) 초·중급 학습자에게 실질적으로 도움이 되는 내용을 우선하세요. 너무 뻔한 인사말/조사는 피하고, 곡 특유의 표현을 골라주세요.`,
  ].join("\n");

  const { experimental_output: parsed } = await generateText({
    model,
    system: systemMsg,
    prompt,
    experimental_output: Output.object({ schema: LessonSchema }),
  });

  return {
    vocab: parsed.vocab.map((v) => ({
      zh: v.zh,
      pinyin: v.pinyin ?? "",
      ko: v.ko ?? "",
      example: v.example || undefined,
    })),
    grammar_notes: parsed.grammar_notes.map((g) => ({
      title: g.title,
      zh_example: g.zh_example,
      pinyin: g.pinyin || undefined,
      ko: g.ko ?? "",
      explanation: g.explanation ?? "",
    })),
  };
}

export const generateSongLessonContent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ songId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SongRow> => {
    await assertEditor(context.userId);
    const row = await fetchSong(data.songId);

    const patch = await buildSongLessonContent({
      title: row.title,
      titleZh: row.title_zh,
      level: row.level,
      lyrics: row.lyrics,
    });

    return updateSong(row.id, patch as unknown as Record<string, unknown>);
  });

// Kick off MP4 video generation for a Suno-generated song.
export const generateSongMp4 = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ songId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { sunoCreateMp4 } = await import("@/lib/suno.server");

    const row = await fetchSong(data.songId);
    if (!row.suno_audio_task_id || !row.suno_audio_id) {
      throw new Error("Suno로 생성된 노래만 MP4 영상을 만들 수 있어요.");
    }

    const { taskId } = await sunoCreateMp4({
      taskId: row.suno_audio_task_id,
      audioId: row.suno_audio_id,
      author: "DingDong",
      domainName: "dingdong.lms",
    });

    await updateSong(row.id, {
      suno_mp4_task_id: taskId,
      status: "generating_video",
    });
    return { taskId };
  });

// Poll MP4 task; on SUCCESS copy the file onto the media disk and save the URL.
export const pollSongMp4 = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ songId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SongRow> => {
    await assertEditor(context.userId);
    const row = await fetchSong(data.songId);
    return advanceSongMp4(row);
  });

/** Advance a song whose MP4 is still generating. No auth — shared by the
 * client poller and the background scheduler. */
export async function advanceSongMp4(row: SongRow): Promise<SongRow> {
    const { sunoGetMp4, downloadAndStore } = await import("@/lib/suno.server");

    if (row.video_url) return row; // already done
    if (!row.suno_mp4_task_id) throw new Error("MP4 taskId가 없습니다.");

    const rec = await sunoGetMp4(row.suno_mp4_task_id);
    const MP4_FAIL_HINT: Record<string, string> = {
      CREATE_TASK_FAILED: "MP4 작업 생성 실패. 원본 음원이 만료되었을 수 있어요.",
      GENERATE_MP4_FAILED: "Suno MP4 합성 실패. 잠시 후 다시 시도해주세요.",
      CALLBACK_EXCEPTION: "Suno MP4 콜백 예외. 다시 시도해주세요.",
    };
    if (
      rec.status === "CREATE_TASK_FAILED" ||
      rec.status === "GENERATE_MP4_FAILED" ||
      rec.status === "CALLBACK_EXCEPTION"
    ) {
      await updateSong(row.id, { status: "failed_video" });
      const hint = MP4_FAIL_HINT[rec.status];
      const detail = rec.errorMessage ? ` — ${rec.errorMessage}` : "";
      throw new Error(`${hint ?? `MP4 생성 실패: ${rec.status}`}${detail}`);
    }
    if (rec.status !== "SUCCESS" || !rec.response?.videoUrl) {
      return row; // still pending
    }

    const video = await downloadAndStore(
      rec.response.videoUrl,
      `songs/${row.id}/${row.suno_audio_id ?? "track"}.mp4`,
      "video/mp4",
    );

    return updateSong(row.id, { video_url: video.url, status: "ready" });
}

// ──────────────────────────────────────────────────────────────────────────
// Gemini: draft title + lyrics from a keyword
// ──────────────────────────────────────────────────────────────────────────

const DraftSongInput = z.object({
  keyword: z.string().min(1, "키워드를 입력하세요"),
  level: LevelEnum.default("beginner"),
  style: z.string().min(1).default("cute mandarin pop"),
});

export type DraftedSong = {
  title: string;
  title_zh: string;
  lyrics: string;
  pinyin: string[];
  translation: string[];
};

// Section header like [Verse 1], [Chorus] — kept unannotated.
function isSectionMarker(line: string): boolean {
  return /^\s*\[[^\]]+\]\s*$/.test(line);
}

// Gemini-powered pinyin + Korean annotation for a list of Chinese lyric lines.
// Returns arrays of the same length as input. Section markers → empty strings.
// Never throws — returns empty arrays on failure so callers can continue.
async function annotateLyricsInternal(
  zhLines: string[],
): Promise<{ pinyin: string[]; ko: string[]; error?: string }> {
  const empty = zhLines.map(() => "");
  if (zhLines.length === 0) return { pinyin: [], ko: [] };

  // Mark which lines to annotate; keep 1-based line numbers for the prompt.
  const numbered = zhLines
    .map((zh, i) => ({ n: i + 1, zh, skip: !zh.trim() || isSectionMarker(zh) }))
    .filter((x) => !x.skip);
  if (numbered.length === 0) return { pinyin: empty, ko: empty };

  const gateway = createTextProvider();
  const prompt = `아래 중국어 학습송 가사의 각 라인에 성조 기호가 포함된 한어병음과 자연스러운 한국어 번역을 붙여주세요.
반드시 아래 JSON만 출력하세요 (코드펜스 없이). "lines" 배열의 각 항목은 { "n": 라인번호, "pinyin": "...", "ko": "..." } 형식이고, 입력 라인 번호를 그대로 사용하세요.

입력:
${numbered.map((x) => `${x.n}. ${x.zh}`).join("\n")}

출력 예시:
{"lines":[{"n":1,"pinyin":"nǐ hǎo","ko":"안녕"}]}`;

  let text = "";
  try {
    const result = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      prompt,
    });
    text = result.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { pinyin: empty, ko: empty, error: `Gemini 호출 실패 — ${msg}` };
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s < 0 || e < 0) {
    return { pinyin: empty, ko: empty, error: "AI 응답 JSON 파싱 실패" };
  }
  let parsed: { lines?: Array<{ n?: number; pinyin?: string; ko?: string }> };
  try {
    parsed = JSON.parse(cleaned.slice(s, e + 1));
  } catch {
    return { pinyin: empty, ko: empty, error: "AI 응답 JSON 파싱 실패" };
  }

  const pinyin = [...empty];
  const ko = [...empty];
  const arr = Array.isArray(parsed.lines) ? parsed.lines : [];
  for (const item of arr) {
    const n = typeof item.n === "number" ? item.n : NaN;
    if (!Number.isFinite(n)) continue;
    const idx = n - 1;
    if (idx < 0 || idx >= zhLines.length) continue;
    if (isSectionMarker(zhLines[idx])) continue;
    pinyin[idx] = String(item.pinyin ?? "");
    ko[idx] = String(item.ko ?? "");
  }
  return { pinyin, ko };
}

export const draftSongFromKeyword = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => DraftSongInput.parse(input))
  .handler(async ({ data, context }): Promise<DraftedSong> => {
    await assertEditor(context.userId);
    return draftSongInternal(data);
  });

/** Submit a drafted song to Suno and create the song row (status
 * generating_audio). No auth — for the background scheduler. Returns songId
 * + taskId; the background poller finishes it. Throws on Suno failure. */
export async function submitSongToSuno(args: {
  draft: DraftedSong;
  level: "beginner" | "intermediate" | "advanced";
  style: string;
  topic: string;
  userId: string;
  vocalGender?: "m" | "f";
  model?: "V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5" | "V5_5";
}): Promise<{ songId: string; taskId: string }> {
  const { sunoCreateMusic } = await import("@/lib/suno.server");
  const { db, tables } = await import("@/db");

  const zhLines = args.draft.lyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const parsedLyrics = zhLines.map((zh, i) => ({
    zh,
    pinyin: args.draft.pinyin[i] ?? "",
    ko: args.draft.translation[i] ?? "",
  }));

  const { taskId } = await sunoCreateMusic({
    title: args.draft.title_zh || args.draft.title,
    style: args.style,
    prompt: args.draft.lyrics,
    model: args.model ?? "V4_5",
    vocalGender: args.vocalGender,
  });

  const [row] = await db
    .insert(tables.songs)
    .values({
      title: args.draft.title,
      title_zh: args.draft.title_zh || null,
      level: args.level,
      style: args.style,
      topic: args.topic || null,
      lyrics: parsedLyrics as unknown as Json,
      status: "generating_audio",
      suno_audio_task_id: taskId,
      created_by: args.userId,
    })
    .returning({ id: tables.songs.id });
  return { songId: row.id, taskId };
}

/** AI lyrics draft from a keyword. No auth — shared by the client FN and the
 * background song scheduler. */
export async function draftSongInternal(data: {
  keyword: string;
  level: "beginner" | "intermediate" | "advanced";
  style: string;
}): Promise<DraftedSong> {
    const gateway = createTextProvider();
    const levelHint =
      data.level === "beginner"
        ? "HSK 1~2 수준의 아주 쉬운 단어와 짧은 문장 (4~7자)"
        : data.level === "intermediate"
          ? "HSK 3~4 수준의 일상 어휘"
          : "HSK 5 이상, 표현이 풍부하게";

    const prompt = `너는 한국인 중국어 학습자를 위한 학습송 작사가야.
주제 키워드: "${data.keyword}"
난이도: ${levelHint}
음악 스타일: ${data.style}

요구사항:
- 자연스럽고 따라 부르기 쉬운 중국어 가사 (Mandarin).
- 구성: [Verse 1] 4줄, [Chorus] 4줄, [Verse 2] 4줄, [Chorus] 4줄.
- 각 줄은 너무 길지 않게 (6~10자 권장).
- 같은 표현이 반복되면 학습 효과가 좋아.
- 제목은 한국어/중국어 둘 다.

반드시 아래 JSON만 출력 (코드펜스 없이):
{"title":"한국어 제목","title_zh":"中文标题","lyrics":"[Verse 1]\\n...\\n[Chorus]\\n...\\n[Verse 2]\\n...\\n[Chorus]\\n..."}`;

    let text = "";
    try {
      const result = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt,
      });
      text = result.text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = /429|rate.?limit|quota/i.test(msg)
        ? "Gemini 요청 한도를 초과했어요. 잠시 후 다시 시도해주세요."
        : /402|credit|insufficient/i.test(msg)
          ? "AI 크레딧이 부족해요. 관리자에게 문의하거나 충전 후 다시 시도해주세요."
          : /401|unauthor|api.?key/i.test(msg)
            ? "Gemini API 키 인증 실패. GEMINI_API_KEY 시크릿을 확인해주세요."
            : null;
      throw new Error(`Gemini 호출 실패 — ${friendly ?? msg}`);
    }

    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) {
      const preview = cleaned.slice(0, 200) || "(빈 응답)";
      throw new Error(
        `AI가 JSON 형식으로 응답하지 않았어요. 응답 앞부분: "${preview}"`,
      );
    }
    let parsed: DraftedSong;
    try {
      parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as DraftedSong;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `AI 응답 JSON 파싱 실패 (${msg}). 다시 시도해주세요.`,
      );
    }
    const lyricsStr = String(parsed.lyrics || "");
    // Annotate the drafted lyrics with pinyin + Korean in the same call.
    const zhLines = lyricsStr
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const ann = await annotateLyricsInternal(zhLines);
    if (ann.error) console.warn("[draftSong] annotate failed:", ann.error);
    return {
      title: String(parsed.title || data.keyword),
      title_zh: String(parsed.title_zh || ""),
      lyrics: lyricsStr,
      pinyin: ann.pinyin,
      translation: ann.ko,
    };
}

// ──────────────────────────────────────────────────────────────────────────
// Re-annotate an existing song: regenerate pinyin + Korean for all lyric lines.
// ──────────────────────────────────────────────────────────────────────────
export const reannotateSong = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ songId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SongRow> => {
    await assertEditor(context.userId);
    const row = await fetchSong(data.songId);

    const lines = row.lyrics ?? [];
    const zhLines = lines.map((l) => l.zh ?? "");
    const ann = await annotateLyricsInternal(zhLines);
    if (ann.error) throw new Error(ann.error);

    const nextLyrics: LyricLine[] = lines.map((l, i) => ({
      ...l,
      pinyin: ann.pinyin[i] || "",
      ko: ann.ko[i] || "",
    }));

    return updateSong(row.id, {
      lyrics: nextLyrics as unknown as Json,
      pinyin: ann.pinyin as unknown as Json,
      translation: ann.ko as unknown as Json,
    });
  });

// ──────────────────────────────────────────────────────────────────────────
// Cancel a stuck Suno generation → mark as failed so the user can retry/delete.
// ──────────────────────────────────────────────────────────────────────────
export const cancelSongGeneration = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ songId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const row = await fetchSong(data.songId);
    const nextStatus =
      row.status === "generating_video" ? "failed_video" : "failed_audio";
    await updateSong(row.id, { status: nextStatus });
    return { ok: true, status: nextStatus } as const;
  });

// Delete a song row (editor only).
export const deleteSong = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ songId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    await db.delete(tables.songs).where(eq(tables.songs.id, data.songId));
    return { ok: true } as const;
  });

// ──────────────────────────────────────────────────────────────────────────
// Curated (real) Chinese song registration.
// ──────────────────────────────────────────────────────────────────────────
function extractYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

const CuratedSongInput = z.object({
  title: z.string().min(1),
  title_zh: z.string().optional().default(""),
  artist: z.string().optional().default(""),
  level: LevelEnum,
  youtube_url: z.string().url(),
  lyrics: z.array(z.string().min(1)).min(1),
  pinyin: z.array(z.string()).default([]),
  translation: z.array(z.string()).default([]),
});

export const createCuratedSong = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => CuratedSongInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const ytId = extractYoutubeId(data.youtube_url);
    if (!ytId) throw new Error("YouTube URL을 인식하지 못했어요.");

    const parsedLyrics: LyricLine[] = data.lyrics.map((zh, i) => ({
      zh,
      pinyin: data.pinyin[i] ?? "",
      ko: data.translation[i] ?? "",
    }));

    const { db, tables } = await import("@/db");
    const [row] = await db
      .insert(tables.songs)
      .values({
        title: data.title,
        title_zh: data.title_zh || null,
        artist: data.artist || null,
        level: data.level,
        source: "curated",
        external_url: data.youtube_url,
        youtube_id: ytId,
        cover_url: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
        lyrics: parsedLyrics as unknown as Json,
        pinyin: data.pinyin as unknown as Json,
        translation: data.translation as unknown as Json,
        status: "ready",
        created_by: context.userId,
      })
      .returning({ id: tables.songs.id });
    return { songId: row.id } as const;
  });
