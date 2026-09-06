import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { requireAuth } from "@/lib/auth-middleware";
import { assertEditor, getRole } from "@/lib/courses.functions";
import { creatorScopeFor, redactSummary, type ConsoleSummary } from "@/lib/console-summary";
import { kstDateKeyNDaysAgo, kstMonthLabel, kstMonthRange } from "@/lib/kst-month";
import { isAdminRole } from "@/lib/roles";

/**
 * 홈 콘솔이 그리는 숫자들.
 *
 * 권한 경계는 화면이 아니라 여기서 선다. `assertEditor`를 통과하지 못한 세션은
 * 숫자를 한 개도 받지 못하고, 관리자 전용 값(승인 대기 교사 수)은 응답 본문을
 * 떠나기 전에 `redactSummary`가 지운다 — 교수자 세션이 이 함수를 직접 불러도
 * 그 값은 나가지 않는다. 화면에서 안 그리는 것으로는 부족하다.
 *
 * 모수 규칙은 console-summary.ts에 적어 뒀다: 작업 큐는 전체, 이번 달 생성
 * 통계는 `isAdmin ? 전체 : 본인`.
 */

/** `/students`가 `idle7dPlus`를 세는 것과 같은 창(窓). */
const ACTIVITY_WINDOW_DAYS = 40;
const IDLE_THRESHOLD_DAYS = 7;

/** 내가 손대야 사라지는 영상 작업. */
const VIDEO_JOB_ACTIONABLE = ["awaiting_approval", "failed"];
/** 서버가 아직 굽고 있는 것 — 내 할 일이 아니라 보조 표기까지가 한계다. */
const VIDEO_JOB_RUNNING = ["queued", "running", "uploading"];

const SONG_FAILED = ["failed_audio", "failed_video"];
const SONG_GENERATING = ["generating_audio", "generating_video"];

export const getConsoleSummary = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<ConsoleSummary> => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");

    const role = await getRole(context.userId);
    const scope = creatorScopeFor(role);
    const now = new Date();
    const { start, end } = kstMonthRange(now);
    const countOf = sql<number>`count(*)::int`;

    // ── 미활동 학습자 ──────────────────────────────────────────────────────
    // getStudentRoster와 같은 규칙으로 센다: 대상은 student·teacher 프로필,
    // 활동 로그는 최근 40일 창만 보고(그보다 오래되면 로스터에서도 "활동 기록
    // 없음"으로 분류돼 미활동에 들어가지 않는다), 마지막 활동일이 7일 이상
    // 지난 사람. 창을 다르게 잡으면 카드를 눌러 간 화면과 숫자가 어긋난다.
    const la = tables.learning_activity;
    const lastActive = await db
      .select({ user_id: la.user_id, last: sql<string>`max(${la.activity_date})` })
      .from(la)
      .where(gte(la.activity_date, kstDateKeyNDaysAgo(ACTIVITY_WINDOW_DAYS, now)))
      .groupBy(la.user_id);
    const learners = await db
      .select({ id: tables.profiles.id })
      .from(tables.profiles)
      .where(inArray(tables.profiles.role, ["student", "teacher"]));
    const learnerIds = new Set(learners.map((row) => row.id));
    const idleCutoff = kstDateKeyNDaysAgo(IDLE_THRESHOLD_DAYS, now);
    const idleStudents = lastActive.filter(
      (row) => learnerIds.has(row.user_id) && row.last <= idleCutoff,
    ).length;

    // ── 작업 큐 (전체) ─────────────────────────────────────────────────────
    // 소유자로 거르지 않는다. `/studio`의 목록에 created_by 필터가 없기
    // 때문이다 — 파이프라인 큐는 "지금 서버가 뭘 굽고 있나"가 주제다.
    const jobs = tables.video_jobs;
    const songs = tables.songs;
    const [videoWaiting] = await db
      .select({ n: countOf })
      .from(jobs)
      .where(inArray(jobs.status, VIDEO_JOB_ACTIONABLE));
    const [videoRunning] = await db
      .select({ n: countOf })
      .from(jobs)
      .where(inArray(jobs.status, VIDEO_JOB_RUNNING));
    const [songsFailed] = await db
      .select({ n: countOf })
      .from(songs)
      .where(inArray(songs.status, SONG_FAILED));
    const [songsGenerating] = await db
      .select({ n: countOf })
      .from(songs)
      .where(inArray(songs.status, SONG_GENERATING));

    // `/integrations` 화면과 같은 함수를 쓴다 — env 키 목록을 두 번 적으면
    // 키가 하나 늘어날 때 카드와 화면의 개수가 갈라진다.
    const { computeIntegrationStatus } = await import("@/lib/integrations-status.server");
    const integrationsMissing = (await computeIntegrationStatus()).filter(
      (item) => !item.configured,
    ).length;

    // ── 이번 달 생성 통계 (관리자는 전체, 교수자는 본인) ───────────────────
    // "영상 학습"은 `/dramas`의 표시 이름이므로 dramas 행을 센다. video_jobs는
    // 생성 파이프라인의 작업 큐지 학습자에게 도달한 결과물이 아니고, 스튜디오를
    // 거치지 않고 등록한 YouTube 영상도 학습자에게는 똑같은 영상 학습이다.
    const dramas = tables.dramas;
    const ownedByMe = scope === "all" ? undefined : context.userId;
    const [videosThisMonth] = await db
      .select({ n: countOf })
      .from(dramas)
      .where(
        and(
          gte(dramas.created_at, start),
          lt(dramas.created_at, end),
          ownedByMe ? eq(dramas.created_by, ownedByMe) : undefined,
        ),
      );
    const [songsThisMonth] = await db
      .select({ n: countOf })
      .from(songs)
      .where(
        and(
          gte(songs.created_at, start),
          lt(songs.created_at, end),
          ownedByMe ? eq(songs.created_by, ownedByMe) : undefined,
        ),
      );

    // ── 관리자 전용 ────────────────────────────────────────────────────────
    // 교수자에게도 세어 두고 응답 직전에 지우는 방식은 실수 한 번에 새 나간다.
    // 관리자일 때만 질의하고, 그 뒤 redactSummary가 한 번 더 막는다.
    let pendingTeachers: number | null = null;
    if (isAdminRole(role)) {
      const [row] = await db
        .select({ n: countOf })
        .from(tables.profiles)
        .where(eq(tables.profiles.teacher_status, "pending"));
      pendingTeachers = row?.n ?? 0;
    }

    return redactSummary(role, {
      idleStudents,
      videoJobsWaiting: videoWaiting?.n ?? 0,
      videoJobsRunning: videoRunning?.n ?? 0,
      songsFailed: songsFailed?.n ?? 0,
      songsGenerating: songsGenerating?.n ?? 0,
      integrationsMissing,
      videosThisMonth: videosThisMonth?.n ?? 0,
      songsThisMonth: songsThisMonth?.n ?? 0,
      monthLabel: kstMonthLabel(now),
      scope,
      pendingTeachers,
    });
  });
