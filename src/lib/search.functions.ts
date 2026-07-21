import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import { optionalAuth } from "@/lib/auth-middleware";

// 통합 검색: 레슨·영상 학습·학습송·(로그인 시)내 단어장을 한 번에.
// 콘텐츠 규모가 작아(수십 건) 별도 인덱스 없이 ILIKE로 충분.

export type SearchHit = {
  type: "lesson" | "drama" | "song" | "vocab";
  id: string; // navigation id (lesson/drama/song id; vocab uses zh)
  title: string;
  subtitle?: string;
};
export type SearchResults = {
  lessons: SearchHit[];
  dramas: SearchHit[];
  songs: SearchHit[];
  vocab: SearchHit[];
  total: number;
};

const EMPTY: SearchResults = { lessons: [], dramas: [], songs: [], vocab: [], total: 0 };
const PER_TYPE = 6;

export const searchContent = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .inputValidator((i: unknown) =>
    z.object({ q: z.string().trim().max(80) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<SearchResults> => {
    const q = data.q.trim();
    if (q.length < 1) return EMPTY;
    const like = `%${q}%`;
    const { db, tables } = await import("@/db");

    const [lessonRows, dramaRows, songRows] = await Promise.all([
      db
        .select({
          id: tables.lessons.id,
          title: tables.lessons.title,
          content_md: tables.lessons.content_md,
        })
        .from(tables.lessons)
        .where(
          or(
            ilike(tables.lessons.title, like),
            ilike(tables.lessons.content_md, like),
            sql`${tables.lessons.key_expressions}::text ILIKE ${like}`,
          ),
        )
        .orderBy(desc(tables.lessons.created_at))
        .limit(PER_TYPE),
      db
        .select({
          id: tables.dramas.id,
          title: tables.dramas.title,
          title_zh: tables.dramas.title_zh,
        })
        .from(tables.dramas)
        .where(
          or(
            ilike(tables.dramas.title, like),
            ilike(tables.dramas.title_zh, like),
            ilike(tables.dramas.description, like),
          ),
        )
        .orderBy(desc(tables.dramas.created_at))
        .limit(PER_TYPE),
      db
        .select({
          id: tables.songs.id,
          title: tables.songs.title,
          title_zh: tables.songs.title_zh,
          artist: tables.songs.artist,
        })
        .from(tables.songs)
        .where(
          or(
            ilike(tables.songs.title, like),
            ilike(tables.songs.title_zh, like),
            ilike(tables.songs.artist, like),
            sql`${tables.songs.lyrics}::text ILIKE ${like}`,
          ),
        )
        .orderBy(desc(tables.songs.created_at))
        .limit(PER_TYPE),
    ]);

    // 단어장은 로그인 사용자 본인 것만.
    let vocab: SearchHit[] = [];
    if (context.userId) {
      const vocabRows = await db
        .select({
          zh: tables.vocabulary.zh,
          pinyin: tables.vocabulary.pinyin,
          ko: tables.vocabulary.ko,
        })
        .from(tables.vocabulary)
        .where(
          and(
            eq(tables.vocabulary.user_id, context.userId),
            or(
              ilike(tables.vocabulary.zh, like),
              ilike(tables.vocabulary.pinyin, like),
              ilike(tables.vocabulary.ko, like),
            ),
          ),
        )
        .orderBy(desc(tables.vocabulary.created_at))
        .limit(PER_TYPE);
      vocab = vocabRows.map((v) => ({
        type: "vocab" as const,
        id: v.zh,
        title: v.zh,
        subtitle: [v.pinyin, v.ko].filter(Boolean).join(" · ") || undefined,
      }));
    }

    const lessons: SearchHit[] = lessonRows.map((l) => ({
      type: "lesson",
      id: l.id,
      title: l.title,
    }));
    const dramas: SearchHit[] = dramaRows.map((d) => ({
      type: "drama",
      id: d.id,
      title: d.title,
      subtitle: d.title_zh ?? undefined,
    }));
    const songs: SearchHit[] = songRows.map((s) => ({
      type: "song",
      id: s.id,
      title: s.title,
      subtitle: [s.title_zh, s.artist].filter(Boolean).join(" · ") || undefined,
    }));

    return {
      lessons,
      dramas,
      songs,
      vocab,
      total: lessons.length + dramas.length + songs.length + vocab.length,
    };
  });
