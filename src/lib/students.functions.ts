import { createServerFn } from "@tanstack/react-start";
import { eq, gte, inArray, sql } from "drizzle-orm";

import { requireAuth } from "@/lib/auth-middleware";
import { assertEditor } from "@/lib/courses.functions";
import { kstToday } from "@/lib/learning-activity.server";

// 교사/관리자용 학습자 현황 로스터. 반/수강 등록 개념이 없어 전체 학습자
// (student + teacher)를 대상으로 한다 (플랫폼 규모가 작음). 관리자는 제외.

export type StudentRow = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  streak: number;
  lastActive: string | null; // "YYYY-MM-DD" KST
  daysIdle: number | null; // null = 활동 기록 없음
  actions7d: number;
  vocabTotal: number;
  lessonsCompleted: number;
  quizAvgPct: number | null;
  joinedAt: string;
};
export type StudentRoster = {
  students: StudentRow[];
  summary: {
    total: number;
    activeToday: number;
    idle7dPlus: number; // 7일 이상 미활동 (활동 기록 있던 학생 중)
    neverActive: number;
  };
};

function kstDateNDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
}

export const getStudentRoster = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<StudentRoster> => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");

    // 학생 프로필 + 이메일.
    const profs = await db
      .select({
        id: tables.profiles.id,
        role: tables.profiles.role,
        nickname: tables.profiles.nickname,
        real_name: tables.profiles.real_name,
        created_at: tables.profiles.created_at,
        email: tables.user.email,
      })
      .from(tables.profiles)
      .leftJoin(tables.user, eq(tables.user.id, tables.profiles.id))
      .where(inArray(tables.profiles.role, ["student", "teacher"]));
    if (profs.length === 0) {
      return {
        students: [],
        summary: { total: 0, activeToday: 0, idle7dPlus: 0, neverActive: 0 },
      };
    }

    // 활동 로그 (최근 40일 — 스트릭·7일 활동·마지막 활동 계산에 충분).
    const since = kstDateNDaysAgo(40);
    const acts = await db
      .select({
        user_id: tables.learning_activity.user_id,
        date: tables.learning_activity.activity_date,
        total: sql<number>`(${tables.learning_activity.reviews} + ${tables.learning_activity.words_added} + ${tables.learning_activity.lessons} + ${tables.learning_activity.videos} + ${tables.learning_activity.quizzes})::int`,
      })
      .from(tables.learning_activity)
      .where(gte(tables.learning_activity.activity_date, since));

    // 단어 수 (사용자별).
    const vocabCounts = await db
      .select({
        user_id: tables.vocabulary.user_id,
        n: sql<number>`count(*)::int`,
      })
      .from(tables.vocabulary)
      .groupBy(tables.vocabulary.user_id);

    // 완료 레슨 수 + 레슨 퀴즈 합계.
    const lp = tables.lesson_progress;
    const lessonAgg = await db
      .select({
        user_id: lp.user_id,
        completed: sql<number>`count(*) FILTER (WHERE ${lp.completed_at} IS NOT NULL)::int`,
        qc: sql<number>`coalesce(sum(${lp.quiz_correct}), 0)::int`,
        qt: sql<number>`coalesce(sum(${lp.quiz_total}) FILTER (WHERE ${lp.quiz_correct} IS NOT NULL), 0)::int`,
      })
      .from(lp)
      .groupBy(lp.user_id);

    // 드라마 퀴즈 합계 (quiz_scores jsonb: { sceneIdx: {score,total} }).
    // jsonb 구조를 JS에서 합산 — SQL lateral join보다 견고.
    const dp = tables.drama_progress;
    const dramaRows = await db
      .select({ user_id: dp.user_id, quiz_scores: dp.quiz_scores })
      .from(dp);
    const dramaMap = new Map<string, { qc: number; qt: number }>();
    for (const r of dramaRows) {
      const scores = (r.quiz_scores ?? {}) as Record<string, { score?: number; total?: number }>;
      let qc = dramaMap.get(r.user_id)?.qc ?? 0;
      let qt = dramaMap.get(r.user_id)?.qt ?? 0;
      for (const s of Object.values(scores)) {
        qc += Number(s?.score) || 0;
        qt += Number(s?.total) || 0;
      }
      dramaMap.set(r.user_id, { qc, qt });
    }

    // ── 사용자별 병합 ──
    const actByUser = new Map<string, Set<string>>();
    const total7d = new Map<string, number>();
    const lastActive = new Map<string, string>();
    const sevenAgo = kstDateNDaysAgo(6);
    for (const a of acts) {
      if (!actByUser.has(a.user_id)) actByUser.set(a.user_id, new Set());
      actByUser.get(a.user_id)!.add(a.date);
      if (a.date >= sevenAgo) total7d.set(a.user_id, (total7d.get(a.user_id) ?? 0) + a.total);
      const prev = lastActive.get(a.user_id);
      if (!prev || a.date > prev) lastActive.set(a.user_id, a.date);
    }
    const vocabMap = new Map(vocabCounts.map((v) => [v.user_id, v.n]));
    const lessonMap = new Map(lessonAgg.map((l) => [l.user_id, l]));

    const today = kstToday();
    const computeStreak = (dates: Set<string> | undefined): number => {
      if (!dates || dates.size === 0) return 0;
      let streak = 0;
      const cursor = dates.has(today) ? 0 : 1;
      while (streak < 60 && dates.has(kstDateNDaysAgo(cursor + streak))) streak++;
      return streak;
    };

    const students: StudentRow[] = profs.map((p) => {
      const dates = actByUser.get(p.id);
      const last = lastActive.get(p.id) ?? null;
      const daysIdle = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86400_000) : null;
      const les = lessonMap.get(p.id);
      const dra = dramaMap.get(p.id);
      const qc = (les?.qc ?? 0) + (dra?.qc ?? 0);
      const qt = (les?.qt ?? 0) + (dra?.qt ?? 0);
      return {
        id: p.id,
        name: p.nickname || p.real_name || (p.email ?? "이름 없음").split("@")[0],
        role: p.role,
        email: p.email,
        streak: computeStreak(dates),
        lastActive: last,
        daysIdle,
        actions7d: total7d.get(p.id) ?? 0,
        vocabTotal: vocabMap.get(p.id) ?? 0,
        lessonsCompleted: les?.completed ?? 0,
        quizAvgPct: qt > 0 ? Math.round((qc / qt) * 100) : null,
        joinedAt: p.created_at,
      };
    });

    // 기본 정렬: 유휴일 많은 순(관심 필요 학생 먼저), 활동 없는 학생은 뒤.
    students.sort((a, b) => {
      if (a.daysIdle == null && b.daysIdle == null) return 0;
      if (a.daysIdle == null) return 1;
      if (b.daysIdle == null) return -1;
      return b.daysIdle - a.daysIdle;
    });

    return {
      students,
      summary: {
        total: students.length,
        activeToday: students.filter((s) => s.daysIdle === 0).length,
        idle7dPlus: students.filter((s) => s.daysIdle != null && s.daysIdle >= 7).length,
        neverActive: students.filter((s) => s.daysIdle == null).length,
      },
    };
  });
