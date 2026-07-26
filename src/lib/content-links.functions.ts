import { createServerFn } from "@tanstack/react-start";
import { eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { optionalAuth, requireAuth } from "@/lib/auth-middleware";
import { assertEditor } from "@/lib/courses.functions";
import type { Json } from "@/db/schema";

// ── 연계 학습 (노래 ↔ 레슨) ─────────────────────────────────────────────────
// Word-level overlap between songs (poetic vocab) and lessons (conversation)
// is nearly empty on real content, so the linking is computed once by AI —
// thematic/grammar-level connections + differences — and cached on the song
// row (songs.related_content).

const AiLinkSchema = z.object({
  lesson_number: z.number().int().min(1),
  reason: z.string().min(1), // 연계성 (한국어 1~2문장)
  shared: z
    .array(z.object({ zh: z.string(), note: z.string().default("") }))
    .default([]), // 공통/연관 표현
  difference: z.string().default(""), // 차이점 (형식·난이도·쓰임)
  order_tip: z.string().default(""), // 추천 학습 순서
});
const AiRelatedSchema = z.object({
  summary: z.string().default(""), // 이 노래의 학습 활용 요약 (2~3문장)
  links: z.array(AiLinkSchema).min(1).max(4),
});

export type SongContentLink = {
  lesson_id: string;
  lesson_title: string;
  reason: string;
  shared: { zh: string; note: string }[];
  difference: string;
  order_tip: string;
};
export type SongRelatedContent = {
  summary: string;
  links: SongContentLink[];
  generated_at: string;
};

async function generateAndCache(songId: string): Promise<SongRelatedContent | null> {
  const { db, tables } = await import("@/db");
  const songs = await db
    .select({
      id: tables.songs.id,
      title: tables.songs.title,
      title_zh: tables.songs.title_zh,
      level: tables.songs.level,
      vocab: tables.songs.vocab,
      grammar_notes: tables.songs.grammar_notes,
      lyrics: tables.songs.lyrics,
    })
    .from(tables.songs)
    .where(eq(tables.songs.id, songId))
    .limit(1);
  const song = songs[0];
  if (!song) throw new Error("노래를 찾을 수 없습니다.");

  const lessons = await db
    .select({
      id: tables.lessons.id,
      title: tables.lessons.title,
      level: tables.lessons.level,
      key_expressions: tables.lessons.key_expressions,
    })
    .from(tables.lessons)
    .orderBy(tables.lessons.created_at);
  if (lessons.length === 0) return null;

  const catalog = lessons
    .map((l, i) => {
      const exprs = (Array.isArray(l.key_expressions) ? l.key_expressions : [])
        .map((e) => (e as { zh?: string })?.zh)
        .filter(Boolean)
        .slice(0, 6)
        .join(" / ");
      return `${i + 1}. "${l.title}" (레벨: ${l.level ?? "?"}) 핵심표현: ${exprs || "(없음)"}`;
    })
    .join("\n");

  const vocab = (Array.isArray(song.vocab) ? song.vocab : [])
    .map((v) => {
      const w = v as { zh?: string; ko?: string };
      return w?.zh ? `${w.zh}(${w.ko ?? ""})` : null;
    })
    .filter(Boolean)
    .join(", ");
  const grammar = (Array.isArray(song.grammar_notes) ? song.grammar_notes : [])
    .map((g) => (g as { title?: string })?.title)
    .filter(Boolean)
    .join(", ");
  const lyricsText = (Array.isArray(song.lyrics) ? song.lyrics : [])
    .map((l) => (typeof l === "string" ? l : (l as { zh?: string })?.zh))
    .filter(Boolean)
    .slice(0, 16)
    .join("\n");

  const { generateText, Output } = await import("ai");
  const { createTextProvider } = await import("@/lib/ai-gateway.server");
  const gateway = createTextProvider();

  const { experimental_output: parsed } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    system:
      "당신은 한국인 학습자를 위한 중국어 교육과정 설계 전문가입니다. 반드시 지정된 JSON 스키마로만 응답하세요.",
    prompt: [
      `[학습송] "${song.title}"${song.title_zh ? ` (${song.title_zh})` : ""} — 레벨 ${song.level}`,
      `핵심 단어: ${vocab || "(없음)"}`,
      `문법 포인트: ${grammar || "(없음)"}`,
      `가사(발췌):\n${lyricsText}`,
      "",
      `[레슨 목록]\n${catalog}`,
      "",
      "위 학습송과 학습 연계성이 가장 높은 레슨을 2~4개 골라주세요. 단어가 직접 겹치지 않아도 주제·문법·정서·난이도 연결이 있으면 좋습니다.",
      "각 링크마다:",
      "- reason: 학생에게 보여줄 연계성 설명 (한국어 1~2문장, 구체적으로)",
      "- shared: 두 콘텐츠를 잇는 중국어 표현/한자 1~4개 { zh, note(짧은 한국어 설명) }. 없으면 빈 배열.",
      "- difference: 형식·난이도·쓰임의 차이 1문장 (노래는 어떻게 다른지)",
      "- order_tip: 추천 학습 순서 1문장 (예: 레슨으로 표현을 익힌 뒤 노래로 정착)",
      "summary: 이 노래를 학습에 활용하는 법 2~3문장.",
      "lesson_number는 반드시 위 목록의 번호를 사용하세요.",
    ].join("\n"),
    experimental_output: Output.object({ schema: AiRelatedSchema }),
  });

  const links: SongContentLink[] = parsed.links
    .filter((l) => l.lesson_number >= 1 && l.lesson_number <= lessons.length)
    .map((l) => ({
      lesson_id: lessons[l.lesson_number - 1].id,
      lesson_title: lessons[l.lesson_number - 1].title,
      reason: l.reason,
      shared: l.shared,
      difference: l.difference,
      order_tip: l.order_tip,
    }));
  if (links.length === 0) return null;

  const result: SongRelatedContent = {
    summary: parsed.summary,
    links,
    generated_at: new Date().toISOString(),
  };
  await db
    .update(tables.songs)
    .set({ related_content: result as unknown as Json })
    .where(eq(tables.songs.id, songId));
  return result;
}

/** 노래의 연계 학습 데이터 — 캐시가 없으면 최초 1회 AI로 생성.
 *
 * Reading the cache is open to everyone; the generation on a miss is a model
 * call, so it needs a session. A guest on an ungenerated song just gets null
 * and the section stays hidden, exactly as it already does when generation
 * fails. */
export const getSongRelatedContent = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .inputValidator((i: unknown) => z.object({ songId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<SongRelatedContent | null> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({ related_content: tables.songs.related_content })
      .from(tables.songs)
      .where(eq(tables.songs.id, data.songId))
      .limit(1);
    if (!rows[0]) throw new Error("노래를 찾을 수 없습니다.");
    const cached = rows[0].related_content as SongRelatedContent | null;
    if (cached?.links?.length) return cached;
    if (!context.userId) return null;
    try {
      return await generateAndCache(data.songId);
    } catch (e) {
      console.warn("[content-links] 생성 실패:", e);
      return null;
    }
  });

/** (편집자) 연계 데이터를 다시 생성. */
export const regenerateSongRelatedContent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => z.object({ songId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<SongRelatedContent | null> => {
    await assertEditor(context.userId);
    return generateAndCache(data.songId);
  });

export type LessonRelatedSong = {
  song_id: string;
  song_title: string;
  reason: string;
  order_tip: string;
};

/** 레슨 쪽 역방향: 이 레슨과 연계된 학습송 (캐시된 데이터만 사용). */
export const getLessonRelatedSongs = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ lessonId: z.string().uuid() }).parse(i))
  .handler(async ({ data }): Promise<LessonRelatedSong[]> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        id: tables.songs.id,
        title: tables.songs.title,
        related_content: tables.songs.related_content,
      })
      .from(tables.songs)
      .where(isNotNull(tables.songs.related_content));
    const out: LessonRelatedSong[] = [];
    for (const r of rows) {
      const rc = r.related_content as SongRelatedContent | null;
      const link = rc?.links?.find((l) => l.lesson_id === data.lessonId);
      if (link) {
        out.push({
          song_id: r.id,
          song_title: r.title,
          reason: link.reason,
          order_tip: link.order_tip,
        });
      }
    }
    return out;
  });
