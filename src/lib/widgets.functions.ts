import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { WIDGET_IDS, sanitizeLayout, type WidgetId } from "@/lib/widget-catalog";
import type { DueWord } from "@/lib/widget-catalog";
import type { Json } from "@/db/schema";

// ── 위젯 패널 ────────────────────────────────────────────────────────────────
// The ids, their labels and the layout rules live in widget-catalog.ts, which
// is pure and client-safe; this module only reaches the database. Callers
// import them from there directly — re-exporting them here would put a
// server-function module back on the path to a string array.

/** 저장된 위젯 배치 (없으면 null → 클라이언트가 기본값 사용). */
export const getWidgetLayout = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<WidgetId[] | null> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({ widget_layout: tables.profiles.widget_layout })
      .from(tables.profiles)
      .where(eq(tables.profiles.id, context.userId))
      .limit(1);
    const raw = rows[0]?.widget_layout;
    // A row that has never been edited returns null so the client falls back
    // to the default; an empty array is a real choice and is preserved.
    if (!Array.isArray(raw)) return null;
    return sanitizeLayout(raw);
  });

export const saveWidgetLayout = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) =>
    z.object({ layout: z.array(z.enum(WIDGET_IDS)).max(20) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    await db
      .update(tables.profiles)
      .set({ widget_layout: data.layout as unknown as Json })
      .where(eq(tables.profiles.id, context.userId));
    return { ok: true as const };
  });

// ── 오늘의 명언 ──────────────────────────────────────────────────────────────
// A pool of quotes is generated once by AI and cached in app_credentials
// (key "daily_quotes"); the day of the KST calendar rotates through it.

export type DailyQuote = { zh: string; pinyin: string; ko: string; note: string };

const QuotePoolSchema = z.object({
  quotes: z
    .array(
      z.object({
        zh: z.string().min(1),
        pinyin: z.string().min(1),
        ko: z.string().min(1),
        note: z.string().default(""),
      }),
    )
    .min(30),
});

async function ensureQuotePool(): Promise<DailyQuote[]> {
  const { db, tables } = await import("@/db");
  const rows = await db
    .select({ value: tables.app_credentials.value })
    .from(tables.app_credentials)
    .where(eq(tables.app_credentials.key, "daily_quotes"))
    .limit(1);
  const cached = rows[0]?.value as { quotes?: DailyQuote[] } | undefined;
  if (cached?.quotes?.length) return cached.quotes;

  const { generateText, Output } = await import("ai");
  const { createTextProviderFor } = await import("@/lib/ai-gateway.server");
  // 명언 풀은 앱 전역 캐시고 로그인 없이도 읽히므로 사용자가 없다 — 공용 키 고정.
  const gateway = await createTextProviderFor(null);
  const { experimental_output: parsed } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    system:
      "당신은 한국인 중국어 학습자를 위한 교육 콘텐츠 작가입니다. 반드시 지정된 JSON 스키마로만 응답하세요.",
    prompt: [
      "중국어 학습 앱의 '오늘의 명언' 위젯에 쓸 명언 60개를 만들어주세요.",
      "- 출처: 성어(成语), 속담(俗语), 고전 명구, 현대 격언을 골고루.",
      "- 난이도: 초·중급 학습자가 읽을 수 있는 짧은 문장 위주 (4~12자).",
      "- 각 항목: zh(간체 중국어), pinyin(성조 기호), ko(자연스러운 한국어 번역), note(뜻·유래 한 줄 설명).",
      "- 학습 동기부여, 꾸준함, 배움, 시간, 우정 등 긍정적 주제로.",
      "- 중복 없이 다양하게.",
    ].join("\n"),
    experimental_output: Output.object({ schema: QuotePoolSchema }),
  });

  const value = { quotes: parsed.quotes, generated_at: new Date().toISOString() };
  await db
    .insert(tables.app_credentials)
    .values({ key: "daily_quotes", value: value as unknown as Json })
    .onConflictDoUpdate({
      target: tables.app_credentials.key,
      set: { value: value as unknown as Json, updated_at: new Date().toISOString() },
    });
  return parsed.quotes;
}

/** 오늘(KST)의 명언 — 풀에서 날짜 기준 순환. */
export const getDailyQuote = createServerFn({ method: "GET" }).handler(
  async (): Promise<DailyQuote | null> => {
    try {
      const quotes = await ensureQuotePool();
      const kstDay = Math.floor((Date.now() + 9 * 3600_000) / 86_400_000);
      return quotes[kstDay % quotes.length] ?? null;
    } catch (e) {
      console.warn("[widgets] 명언 로드 실패:", e);
      return null;
    }
  },
);

// ── 미니 대시보드 / 캘린더 데이터 ────────────────────────────────────────────

export type WidgetStats = {
  dueCount: number;
  streak: number;
  /** 최근 62일 중 학습한 날짜들 ("YYYY-MM-DD", KST) — 캘린더 점 표시용 */
  activityDates: string[];
};

function kstDateKey(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export const getWidgetStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<WidgetStats> => {
    const { db, tables } = await import("@/db");

    const [{ dueCount }] = await db
      .select({ dueCount: sql<number>`count(*)::int` })
      .from(tables.vocabulary)
      .where(
        and(
          eq(tables.vocabulary.user_id, context.userId),
          lte(tables.vocabulary.srs_due_at, new Date().toISOString()),
        ),
      );

    const since = new Date(Date.now() - 62 * 86_400_000);
    const acts = await db
      .select({ date: tables.learning_activity.activity_date })
      .from(tables.learning_activity)
      .where(
        and(
          eq(tables.learning_activity.user_id, context.userId),
          gte(tables.learning_activity.activity_date, kstDateKey(since)),
        ),
      );
    const dates = new Set(acts.map((a) => a.date));

    // Streak: consecutive days ending today (or yesterday if today idle).
    let streak = 0;
    const today = kstDateKey(new Date());
    let cursor = dates.has(today) ? new Date() : new Date(Date.now() - 86_400_000);
    while (dates.has(kstDateKey(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - 86_400_000);
    }

    return { dueCount, streak, activityDates: [...dates].sort() };
  });

// ── ▶️ 이어보기 (영상 학습) ──────────────────────────────────────────────────

export type ContinueWatching = {
  drama_id: string;
  title: string;
  thumbnail_url: string | null;
  last_seconds: number;
  duration_seconds: number | null;
  percent: number;
} | null;

export const getContinueWatching = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<ContinueWatching> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        drama_id: tables.drama_progress.drama_id,
        last_seconds: tables.drama_progress.last_seconds,
        title: tables.dramas.title,
        thumbnail_url: tables.dramas.thumbnail_url,
        duration_seconds: tables.dramas.duration_seconds,
      })
      .from(tables.drama_progress)
      .innerJoin(tables.dramas, eq(tables.drama_progress.drama_id, tables.dramas.id))
      .where(
        and(
          eq(tables.drama_progress.user_id, context.userId),
          sql`${tables.drama_progress.last_seconds} > 5`,
        ),
      )
      .orderBy(sql`${tables.drama_progress.updated_at} DESC`)
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    const percent = r.duration_seconds
      ? Math.min(100, Math.round((r.last_seconds / r.duration_seconds) * 100))
      : 0;
    return {
      drama_id: r.drama_id,
      title: r.title,
      thumbnail_url: r.thumbnail_url,
      last_seconds: r.last_seconds,
      duration_seconds: r.duration_seconds,
      percent,
    };
  });

// ── 🎵 오늘의 학습송 ─────────────────────────────────────────────────────────

export type DailySong = {
  id: string;
  title: string;
  title_zh: string | null;
  level: string;
  cover_url: string | null;
} | null;

export const getDailySong = createServerFn({ method: "GET" }).handler(
  async (): Promise<DailySong> => {
    const { db, tables } = await import("@/db");
    // Only songs ready to study (have audio). Rotate by KST date so the
    // "song of the day" is stable for everyone within a day.
    const rows = await db
      .select({
        id: tables.songs.id,
        title: tables.songs.title,
        title_zh: tables.songs.title_zh,
        level: tables.songs.level,
        cover_url: tables.songs.cover_url,
      })
      .from(tables.songs)
      .where(sql`${tables.songs.media_url} IS NOT NULL`)
      .orderBy(tables.songs.created_at);
    if (rows.length === 0) return null;
    const kstDay = Math.floor((Date.now() + 9 * 3600_000) / 86_400_000);
    return rows[kstDay % rows.length] ?? null;
  },
);

// ── 🃏 오늘의 단어 ───────────────────────────────────────────────────────────

/**
 * A short queue of words that are due, not the whole backlog: the widget grades
 * one card at a time and refetches when it runs out, and shipping hundreds of
 * rows to render one card is the kind of thing that only shows up in
 * production.
 */
/** The card needs the reading and the meaning, not just the characters. */
export type DueVocab = DueWord & { pinyin: string | null; ko: string | null };

export const getDueVocabQueue = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DueVocab[]> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        id: tables.vocabulary.id,
        zh: tables.vocabulary.zh,
        pinyin: tables.vocabulary.pinyin,
        ko: tables.vocabulary.ko,
      })
      .from(tables.vocabulary)
      .where(
        and(
          eq(tables.vocabulary.user_id, context.userId),
          lte(tables.vocabulary.srs_due_at, new Date().toISOString()),
        ),
      )
      .orderBy(tables.vocabulary.srs_due_at)
      .limit(10);
    return rows;
  });

// ── 📖 수업 이어하기 ─────────────────────────────────────────────────────────

export type ContinueLesson = {
  lesson_id: string;
  title: string;
  course_title: string | null;
  completed_tabs: number;
  done: boolean;
} | null;

/**
 * The most recently touched lesson that is not finished. `continue` already
 * does this for video; lessons are the main content and had no way back in.
 */
export const getContinueLesson = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<ContinueLesson> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        lesson_id: tables.lesson_progress.lesson_id,
        completed_tabs: tables.lesson_progress.completed_tabs,
        completed_at: tables.lesson_progress.completed_at,
        title: tables.lessons.title,
        course_title: tables.courses.title,
      })
      .from(tables.lesson_progress)
      .innerJoin(tables.lessons, eq(tables.lesson_progress.lesson_id, tables.lessons.id))
      .leftJoin(tables.courses, eq(tables.lessons.course_id, tables.courses.id))
      .where(eq(tables.lesson_progress.user_id, context.userId))
      .orderBy(sql`${tables.lesson_progress.updated_at} DESC`)
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      lesson_id: r.lesson_id,
      title: r.title,
      course_title: r.course_title,
      completed_tabs: Array.isArray(r.completed_tabs) ? r.completed_tabs.length : 0,
      done: !!r.completed_at,
    };
  });
