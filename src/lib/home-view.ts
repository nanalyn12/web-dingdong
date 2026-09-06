import { isEditorRole } from "./roles";

/**
 * `/` 가 무엇을 그릴지. 답은 셋이고, 놓치기 쉬운 것은 세 번째다.
 *
 * `useMyProfile()`은 `enabled: !!session`이라 로그인한 교수자의 첫 페인트
 * 시점에 프로필이 아직 `undefined`다. "교수자가 아니면 랜딩"으로 분기하면
 * 교수자는 새로고침할 때마다 학습자 hero를 한 프레임 보고 나서 콘솔로 바뀐다.
 *
 * 반대 실수는 더 조용하고 더 나쁘다. 역할을 모르는 동안 무조건 스켈레톤을
 * 그리면 비로그인 방문자의 SSR HTML까지 스켈레톤이 되고, `_app.index.tsx`의
 * OG 태그가 광고하는 내용과 실제 마크업이 어긋난다. 에러는 나지 않고, 트래픽이
 * 알려줄 때까지 아무도 모른다.
 *
 * 그래서 갈라야 하는 것은 "세션이 없다"와 "아직 모른다"이다. 없다고 **확정된**
 * 방문자는 기다리지 않는다.
 */
export type HomeView = "landing" | "console" | "loading";

export type HomeViewInput = {
  sessionLoading: boolean;
  hasSession: boolean;
  profileLoaded: boolean;
  role: string | null | undefined;
};

export function homeViewFor({
  sessionLoading,
  hasSession,
  profileLoaded,
  role,
}: HomeViewInput): HomeView {
  // 확정된 비로그인. 프로필 상태를 볼 이유가 없다 — 조회조차 되지 않는다.
  if (!sessionLoading && !hasSession) return "landing";
  if (sessionLoading || !profileLoaded) return "loading";
  // 콘솔은 화이트리스트로만 열린다. `role !== "student"` 같은 부정 조건으로
  // 두면 나중에 role이 하나 늘어날 때 관리 화면이 조용히 열린다.
  return isEditorRole(role) ? "console" : "landing";
}
