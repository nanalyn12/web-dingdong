/**
 * Fisher-Yates 셔플.
 *
 * 이 저장소는 원래 `[...arr].sort(() => Math.random() - 0.5)`를 셔플로 썼다.
 * 짧지만 균등하지 않다 — 비교자가 일관되지 않아 정렬 구현이 원소를 원래 자리
 * 근처에 남기고, 순열마다 나올 확률이 크게 다르다. 학습 화면에서는 이게
 * 그대로 문제 품질로 드러났다: 매칭 게임의 한국어 열이 중국어 열과 비슷한
 * 순서로 남아 뜻이 아니라 같은 행 위치로 풀리고, 가사 순서 맞추기는 거의 풀린
 * 상태로 시작했다.
 *
 * `random`을 인자로 받는 이유는 테스트 때문이다. 주입하면 결과가 결정적이 되어
 * "모든 순열이 나올 수 있는가"를 확률이 아니라 사실로 검사할 수 있다.
 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
