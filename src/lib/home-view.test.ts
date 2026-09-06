import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { homeViewFor } from "./home-view";

/*
 * Batch ⑬ — what `/` draws, before it knows who is asking.
 *
 * There are three answers, not two, and the third is the one that gets missed.
 * `useMyProfile()` is `enabled: !!session`, so at a signed-in teacher's first
 * paint the profile is `undefined` (F-8). Branch on "not a teacher yet →
 * landing" and every teacher sees the learner hero flash on every load before
 * it is swapped for the console.
 *
 * The opposite mistake is quieter and worse: draw a skeleton whenever the role
 * is unknown, and a signed-out visitor's SSR HTML becomes a skeleton too. The
 * `head` meta on `_app.index.tsx` — OG tags included — then advertises a page
 * whose markup no longer contains "오늘도 중국어 한 입". Crawlers get the
 * skeleton. Nothing errors, and nobody notices until traffic does.
 *
 * So the distinction that matters is *confirmed* absence of a session versus
 * not knowing yet. A visitor known to be signed out never waits.
 */

type Input = Parameters<typeof homeViewFor>[0];

const SIGNED_OUT: Input = {
  sessionLoading: false,
  hasSession: false,
  profileLoaded: false,
  role: null,
};

const loaded = (role: string | null | undefined): Input => ({
  sessionLoading: false,
  hasSession: true,
  profileLoaded: true,
  role,
});

describe("비로그인 방문자", () => {
  // SSR의 첫 바이트가 랜딩이어야 한다. 프로필을 모르는 것은 당연하고, 기다릴
  // 이유도 없다 — 세션이 없다는 것은 이미 확정된 사실이다.
  it("세션이 없다고 확정된 방문자는 즉시 랜딩을 받는다", () => {
    expect(homeViewFor(SIGNED_OUT)).toBe("landing");
  });

  it("프로필 상태와 무관하게 랜딩이다", () => {
    expect(homeViewFor({ ...SIGNED_OUT, profileLoaded: true, role: "teacher" })).toBe("landing");
  });
});

describe("역할이 확정된 뒤", () => {
  it("학습자는 기존 랜딩을 그대로 본다", () => {
    expect(homeViewFor(loaded("student"))).toBe("landing");
  });

  it("교수자는 콘솔을 본다", () => {
    expect(homeViewFor(loaded("teacher"))).toBe("console");
  });

  it("관리자는 콘솔을 본다", () => {
    expect(homeViewFor(loaded("admin"))).toBe("console");
  });

  // 콘솔은 화이트리스트로만 열린다. 처음 보는 role 문자열이 콘솔을 여는 쪽으로
  // 기울면(예: `role !== "student"`), 나중에 role이 하나 늘어날 때 조용히 관리
  // 화면이 열린다.
  it.each(["moderator", "", null, undefined])("알 수 없는 role %s 은 랜딩이다", (role) => {
    expect(homeViewFor(loaded(role))).toBe("landing");
  });
});

describe("아직 모르는 동안", () => {
  // 랜딩을 먼저 그렸다가 콘솔로 바꾸면 교수자는 새로고침할 때마다 학습자 hero를
  // 한 프레임 본다. 그 깜빡임이 D-5의 이유 전부다.
  it("로그인했지만 프로필을 아직 모르면 로딩이다", () => {
    expect(
      homeViewFor({ sessionLoading: false, hasSession: true, profileLoaded: false, role: null }),
    ).toBe("loading");
  });

  it("세션 자체를 확인하는 중이면 로딩이다", () => {
    expect(
      homeViewFor({ sessionLoading: true, hasSession: false, profileLoaded: false, role: null }),
    ).toBe("loading");
  });
});

const HOME_VIEW_SRC = fileURLToPath(new URL("./home-view.ts", import.meta.url));

/** 주석은 규칙을 설명하려고 role 이름을 적을 수 있다. 코드만 본다. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("판정의 출처", () => {
  // roles.ts 머리 주석: "화면과 서버가 각자 조건을 적으면 한쪽만 고쳐졌을 때
  // 버튼은 보이는데 저장이 안 되는 상태가 된다." 홈 분기가 role 문자열을 직접
  // 적으면 이 모듈이 그 열일곱 번째 사본이 된다.
  it("home-view.ts 는 role 문자열을 직접 적지 않는다", () => {
    const code = codeOnly(readFileSync(HOME_VIEW_SRC, "utf8"));
    const offenders = [...code.matchAll(/["'`](teacher|admin)["'`]/g)].map((m) => m[0]);
    expect(offenders).toEqual([]);
  });
});
