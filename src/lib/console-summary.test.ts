import { describe, it, expect } from "vitest";

import { badgeFor, creatorScopeFor, redactSummary } from "./console-summary";

/*
 * Batch ⑬ — who counts what, and what leaves the server.
 *
 * Two rules live here, and they pull in opposite directions on purpose.
 *
 * 1. Scope (D-2). 작업 큐 숫자 — 승인 대기 영상, 실패한 학습송, 미설정 연동,
 *    미활동 학생 — 는 전체를 센다. 그 화면들이 이미 전체를 보여주기 때문이다
 *    (`listVideoJobs`에는 created_by 필터가 없고, `getStudentRoster`는 반 개념이
 *    없어 전체 학습자를 본다). 카드 숫자가 그 화면과 다른 모수를 세면 카드를
 *    눌렀을 때 숫자가 안 맞는다.
 *    반대로 "이번 달에 내가 만든 것"은 소유권 질문이고, 이 앱에서 소유권의 유일한
 *    표현은 `created_by`다(tenant-backup.ts). 같은 질문을 하는 `listMyCurriculums`가
 *    이미 `isAdmin ? 전체 : 본인` 규칙을 쓴다 — 네 번째로 다시 정하지 않는다.
 *
 * 2. Redaction (D-4). 승인 대기 교사 수는 관리자만의 숫자다. 교수자에게는 행동
 *    가능한 정보가 아니다. 화면에서 안 그리는 것으로는 부족하다 — 개발자 도구
 *    네트워크 탭에 그대로 보이기 때문이다. 값이 응답 본문을 떠나기 전에 지워져야
 *    하고, 지우는 판정은 렌더가 아니라 순수 함수여야 테스트할 수 있다(F-6).
 */

const FULL = {
  idleStudents: 4,
  videoJobsWaiting: 2,
  songsFailed: 1,
  integrationsMissing: 3,
  videosThisMonth: 7,
  songsThisMonth: 5,
  pendingTeachers: 3,
};

const asRecord = (value: unknown) => value as Record<string, unknown>;

describe("creatorScopeFor — 이번 달 통계의 모수", () => {
  it("관리자의 이번 달 통계는 전체를 센다", () => {
    expect(creatorScopeFor("admin")).toBe("all");
  });

  it("교수자의 이번 달 통계는 본인이 만든 것만 센다", () => {
    expect(creatorScopeFor("teacher")).toBe("own");
  });
});

describe("redactSummary — 관리자 전용 값", () => {
  it("교수자 응답에는 승인 대기 교사 수가 실리지 않는다", () => {
    expect(asRecord(redactSummary("teacher", FULL)).pendingTeachers ?? null).toBeNull();
  });

  it("관리자 응답에는 승인 대기 교사 수가 그대로 실린다", () => {
    expect(asRecord(redactSummary("admin", FULL)).pendingTeachers).toBe(3);
  });

  // 콘솔은 교수자·관리자만 부르지만, 리댁션이 "관리자가 아닌 경우"가 아니라
  // "교수자인 경우"로 짜이면 role이 비었을 때 값이 새 나간다. 빈 입력을 여기서
  // 막는다.
  it.each(["student", null, undefined, "", "moderator"])(
    "%s 에게도 승인 대기 교사 수를 내주지 않는다",
    (role) => {
      expect(asRecord(redactSummary(role, FULL)).pendingTeachers ?? null).toBeNull();
    },
  );

  // 리댁션이 과하면 교수자의 콘솔이 통째로 빈다 — 조용히 숫자가 사라지는 쪽이
  // 새 나가는 쪽보다 발견이 늦다.
  it.each([
    "videosThisMonth",
    "songsThisMonth",
    "idleStudents",
    "videoJobsWaiting",
    "songsFailed",
    "integrationsMissing",
  ])("교수자 응답에서 %s 는 지워지지 않는다", (key) => {
    expect(asRecord(redactSummary("teacher", FULL))[key]).toBe(asRecord(FULL)[key]);
  });
});

describe("badgeFor — 0은 경보가 아니다", () => {
  // 대기 큐가 0이라는 것은 "할 일 없음"이라는 좋은 소식이다. 그걸 빨간 뱃지로
  // 그리면 매일 아침 처리할 수 없는 알림이 다섯 개 뜨고, 그 다음부터는 진짜
  // 쌓였을 때도 눈에 안 들어온다.
  it("0은 강조하지 않는다", () => {
    const badge = badgeFor(0);
    expect(badge === null || (badge as { tone?: string }).tone === "quiet").toBe(true);
  });

  it("쌓인 개수는 강조한다", () => {
    const badge = badgeFor(3);
    expect(badge).not.toBeNull();
    expect((badge as { tone?: string }).tone).not.toBe("quiet");
  });
});
