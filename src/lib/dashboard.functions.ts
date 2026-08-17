import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";

import { requireAuth } from "@/lib/auth-middleware";
import { kstToday } from "@/lib/learning-activity.server";

export type DashboardData = {
  streak: number;
  todayDue: number;
  vocabTotal: number;
  vocabAdded7d: number;
  vocabByHsk: Record<string, number>;
  quizAvgPct: number | null; // 전체 퀴즈 평균 (드라마+레슨), 제출 없으면 null
  activity: Array<{
    date: string; // "YYYY-MM-DD" KST
    total: number;
    reviews: number;
    words_added: number;
    lessons: number;
    videos: number;
    quizzes: number;
  }>;
  continueWatching: Array<{
    drama_id: string;
    title: string;
    thumbnail_url: string | null;
    last_seconds: number;
    duration_seconds: number | null;
    completed_scenes: number;
    total_scenes: number;
    updated_at: string;
  }>;
  lessons: {
    total: number;
    completed: number;
    recent: Array<{
      lesson_id: string;
      title: string;
      tabs_done: number;
      quiz_correct: number | null;
      quiz_total: number | null;
      completed: boolean;
      updated_at: string;
    }>;
  };
};

function kstDateNDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
}

export const getMyDashboard = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    const { db, tables } = await import("@/db");
    const userId = context.userId;
    const nowIso = new Date().toISOString();

    // ── 단어장 ──
    const vocabRows = await db
      .select({
        hsk: tables.vocabulary.hsk,
        due: tables.vocabulary.srs_due_at,
        created: tables.vocabulary.created_at,
      })
      .from(tables.vocabulary)
      .where(eq(tables.vocabulary.user_id, userId));
    const vocabTotal = vocabRows.length;
    const todayDue = vocabRows.filter((r) => r.due <= nowIso).length;
    const week = new Date(Date.now() - 7 * 86400_000).toISOString();
    const vocabAdded7d = vocabRows.filter((r) => r.created >= week).length;
    const vocabByHsk: Record<string, number> = {};
    for (const r of vocabRows) {
      const k = r.hsk ? String(r.hsk) : "기타";
      vocabByHsk[k] = (vocabByHsk[k] ?? 0) + 1;
    }

    // ── 활동 로그 (최근 84일 = 12주) ──
    const since = kstDateNDaysAgo(83);
    const actRows = await db
      .select()
      .from(tables.learning_activity)
      .where(
        and(
          eq(tables.learning_activity.user_id, userId),
          gte(tables.learning_activity.activity_date, since),
        ),
      );
    const byDate = new Map(actRows.map((r) => [r.activity_date, r]));
    const activity: DashboardData["activity"] = [];
    for (let i = 83; i >= 0; i--) {
      const date = kstDateNDaysAgo(i);
      const r = byDate.get(date);
      activity.push({
        date,
        total: r ? r.reviews + r.words_added + r.lessons + r.videos + r.quizzes : 0,
        reviews: r?.reviews ?? 0,
        words_added: r?.words_added ?? 0,
        lessons: r?.lessons ?? 0,
        videos: r?.videos ?? 0,
        quizzes: r?.quizzes ?? 0,
      });
    }

    // 스트릭: 오늘(또는 어제)부터 연속으로 활동 기록이 있는 날 수.
    const activeDates = new Set(actRows.map((r) => r.activity_date));
    let streak = 0;
    const cursor = activeDates.has(kstToday()) ? 0 : 1;
    while (streak < 84 && activeDates.has(kstDateNDaysAgo(cursor + streak))) {
      streak++;
    }

    // ── 영상 학습 이어보기 ──
    const dp = tables.drama_progress;
    const watchRows = await db
      .select({
        drama_id: dp.drama_id,
        last_seconds: dp.last_seconds,
        completed_scenes: dp.completed_scenes,
        quiz_scores: dp.quiz_scores,
        updated_at: dp.updated_at,
        title: tables.dramas.title,
        thumbnail_url: tables.dramas.thumbnail_url,
        duration_seconds: tables.dramas.duration_seconds,
        scenes: tables.dramas.scenes,
      })
      .from(dp)
      .innerJoin(tables.dramas, eq(dp.drama_id, tables.dramas.id))
      .where(eq(dp.user_id, userId))
      .orderBy(desc(dp.updated_at))
      .limit(6);

    let quizScoreSum = 0;
    let quizTotalSum = 0;
    for (const w of watchRows) {
      const scores = (w.quiz_scores ?? {}) as Record<string, { score: number; total: number }>;
      for (const s of Object.values(scores)) {
        quizScoreSum += s.score;
        quizTotalSum += s.total;
      }
    }
    const continueWatching = watchRows.slice(0, 3).map((w) => ({
      drama_id: w.drama_id,
      title: w.title,
      thumbnail_url: w.thumbnail_url,
      last_seconds: w.last_seconds,
      duration_seconds: w.duration_seconds,
      completed_scenes: ((w.completed_scenes as number[]) ?? []).length,
      total_scenes: Array.isArray(w.scenes) ? w.scenes.length : 0,
      updated_at: w.updated_at,
    }));

    // ── 레슨 진도 ──
    const [{ totalLessons }] = await db
      .select({ totalLessons: sql<number>`count(*)::int` })
      .from(tables.lessons);
    const lp = tables.lesson_progress;
    const lpRows = await db
      .select({
        lesson_id: lp.lesson_id,
        completed_tabs: lp.completed_tabs,
        quiz_correct: lp.quiz_correct,
        quiz_total: lp.quiz_total,
        completed_at: lp.completed_at,
        updated_at: lp.updated_at,
        title: tables.lessons.title,
      })
      .from(lp)
      .innerJoin(tables.lessons, eq(lp.lesson_id, tables.lessons.id))
      .where(eq(lp.user_id, userId))
      .orderBy(desc(lp.updated_at));

    for (const r of lpRows) {
      if (r.quiz_correct != null && r.quiz_total) {
        quizScoreSum += r.quiz_correct;
        quizTotalSum += r.quiz_total;
      }
    }
    const [{ completedLessons }] = await db
      .select({ completedLessons: sql<number>`count(*)::int` })
      .from(lp)
      .where(and(eq(lp.user_id, userId), isNotNull(lp.completed_at)));

    return {
      streak,
      todayDue,
      vocabTotal,
      vocabAdded7d,
      vocabByHsk,
      quizAvgPct: quizTotalSum > 0 ? Math.round((quizScoreSum / quizTotalSum) * 100) : null,
      activity,
      continueWatching,
      lessons: {
        total: totalLessons,
        completed: completedLessons,
        recent: lpRows.slice(0, 3).map((r) => ({
          lesson_id: r.lesson_id,
          title: r.title,
          tabs_done: ((r.completed_tabs as string[]) ?? []).length,
          quiz_correct: r.quiz_correct,
          quiz_total: r.quiz_total,
          completed: r.completed_at != null,
          updated_at: r.updated_at,
        })),
      },
    };
  });
