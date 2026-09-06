import { isAdminRole } from "./roles";

/**
 * 콘솔 숫자의 모수와 노출 범위. 서버가 집계하기 전과 응답을 내보내기 직전에
 * 각각 한 번씩 지나가는 순수 판정들이다.
 *
 * 두 규칙이 일부러 반대 방향으로 당긴다.
 *
 * 1. **작업 큐는 전체를 센다.** 승인 대기 영상·실패한 학습송·미설정 연동·
 *    미활동 학생은 그 화면들이 이미 전체를 보여준다(`listVideoJobs`에는
 *    created_by 필터가 없고, `getStudentRoster`는 반 개념이 없어 전체
 *    학습자를 본다). 카드 숫자가 그 화면과 다른 모수를 세면 카드를 눌렀을 때
 *    숫자가 안 맞는다 — 이 배치에서 가장 쉽게 생기는 버그다.
 *
 * 2. **"이번 달에 만든 것"은 소유권 질문이다.** 이 앱에서 소유권의 유일한
 *    표현은 `created_by`이고(tenant-backup.ts), 같은 질문을 하는
 *    `listMyCurriculums`가 이미 `isAdmin ? 전체 : 본인` 규칙을 쓴다. 네 번째로
 *    다시 정하지 않는다.
 */

/** 이번 달 통계가 세는 범위. */
export type CreatorScope = "all" | "own";

/**
 * 알 수 없는 역할의 기본값은 `"own"`이다. 기본값을 `"all"`로 두면 나중에 이
 * 함수가 다른 곳에서 불릴 때 전체 데이터가 새는 방향으로 조용히 기운다.
 */
export function creatorScopeFor(role: string | null | undefined): CreatorScope {
  return isAdminRole(role) ? "all" : "own";
}

/** 콘솔이 그리는 숫자 묶음. `pendingTeachers`는 관리자에게만 값이 실린다. */
export type ConsoleSummary = {
  /** 7일 이상 미활동 학습자 수 — `/students`의 `idle7dPlus`와 같은 모수. */
  idleStudents: number;
  /** 승인 대기 + 실패한 영상 작업. 내가 손대야 사라지는 것만 센다. */
  videoJobsWaiting: number;
  /** 아직 서버가 굽고 있는 작업 — 내 할 일이 아니므로 보조 표기까지만. */
  videoJobsRunning: number;
  songsFailed: number;
  songsGenerating: number;
  integrationsMissing: number;
  videosThisMonth: number;
  songsThisMonth: number;
  /** `"2026년 9월"` — 위 두 숫자가 무엇을 센 것인지 스스로 말한다. */
  monthLabel: string;
  /** 이번 달 통계의 모수. 교수자의 12와 관리자의 12는 다른 숫자다. */
  scope: CreatorScope;
  pendingTeachers: number | null;
};

/**
 * 관리자 전용 값을 응답에서 지운다.
 *
 * 화면에서 안 그리는 것으로는 부족하다 — 개발자 도구 네트워크 탭에 그대로
 * 보이기 때문이다. 값이 응답 본문을 떠나기 전에 지워져야 한다.
 *
 * 조건을 "관리자가 아니면"으로 쓴다. "교수자면"으로 쓰면 role이 비어 있거나
 * 처음 보는 문자열일 때 값이 새 나간다.
 */
export function redactSummary<T extends { pendingTeachers?: number | null }>(
  role: string | null | undefined,
  summary: T,
): T & { pendingTeachers: number | null } {
  return {
    ...summary,
    pendingTeachers: isAdminRole(role) ? (summary.pendingTeachers ?? null) : null,
  };
}

export type ConsoleBadge = { count: number; tone: "quiet" | "attention" };

/**
 * 대기 큐 숫자의 표기.
 *
 * 0은 "할 일 없음"이라는 좋은 소식이다. 그걸 경고색으로 그리면 매일 아침
 * 처리할 수 없는 알림이 다섯 개 뜨고, 그 다음부터는 진짜 쌓였을 때도 눈에
 * 안 들어온다. 값을 아직 모르는 경우(`null`)와 0을 구분해서, 모르는 동안에는
 * 아무것도 그리지 않는다.
 */
export function badgeFor(count: number | null | undefined): ConsoleBadge | null {
  if (count === null || count === undefined || Number.isNaN(count)) return null;
  if (count <= 0) return { count: 0, tone: "quiet" };
  return { count, tone: "attention" };
}
