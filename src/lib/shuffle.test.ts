import { describe, expect, it } from "vitest";

import { shuffle } from "./shuffle";

/** 난수를 주입해 셔플을 결정적으로 만든다. 값이 떨어지면 0을 돌려준다. */
function randomFrom(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0;
}

/** i번째 단계에서 교환 대상 j를 정확히 고르게 하는 난수값.
 *  구현이 `Math.floor(random() * (i + 1))`로 j를 뽑기 때문이다. */
function pick(j: number, i: number): number {
  return (j + 0.5) / (i + 1);
}

describe("shuffle", () => {
  it("원본 배열을 건드리지 않는다", () => {
    // 얼려서 넘긴다 — 제자리에서 섞으면 여기서 바로 터진다.
    const items = Object.freeze(["a", "b", "c", "d"]);
    expect(() => shuffle(items)).not.toThrow();
    expect(items).toEqual(["a", "b", "c", "d"]);
  });

  it("원소를 잃거나 늘리지 않는다", () => {
    const items = ["a", "b", "c", "d", "e"];
    const out = shuffle(items);
    expect(out).toHaveLength(items.length);
    expect([...out].sort()).toEqual([...items].sort());
  });

  it("중복 원소도 개수 그대로 보존한다", () => {
    const out = shuffle(["a", "a", "b"]);
    expect([...out].sort()).toEqual(["a", "a", "b"]);
  });

  it("빈 배열과 한 개짜리는 그대로다", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(["혼자"])).toEqual(["혼자"]);
  });

  it("난수를 주입하면 결과가 결정적이다", () => {
    // 매 단계 j=0 → 뒤에서부터 앞과 교환.
    expect(shuffle(["a", "b", "c", "d"], randomFrom([0, 0, 0]))).toEqual(["b", "c", "d", "a"]);
  });

  it("난수가 매번 최댓값이면 제자리 교환이라 순서가 유지된다", () => {
    const items = ["a", "b", "c", "d"];
    expect(shuffle(items, randomFrom([0.999, 0.999, 0.999]))).toEqual(items);
  });

  it("모든 순열이 나올 수 있다 — 편향된 sort 셔플과 갈리는 지점", () => {
    // 원소 3개의 순열은 3! = 6가지. 난수 조합을 전부 훑으면 6가지가 모두 나와야
    // 한다. `sort(() => Math.random() - 0.5)`는 이 성질을 만족하지 못해서
    // 원소가 원래 자리 근처에 남고, 매칭·순서 맞추기 문제가 위치로 풀린다.
    const items = ["a", "b", "c"];
    const seen = new Set<string>();
    for (const j2 of [0, 1, 2]) {
      for (const j1 of [0, 1]) {
        seen.add(shuffle(items, randomFrom([pick(j2, 2), pick(j1, 1)])).join(""));
      }
    }
    expect(seen.size).toBe(6);
    expect([...seen].sort()).toEqual(["abc", "acb", "bac", "bca", "cab", "cba"]);
  });

  it("난수를 안 넘기면 Math.random으로 동작한다", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(items);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it("readonly 배열도 받는다", () => {
    const items: readonly string[] = ["a", "b"];
    expect([...shuffle(items)].sort()).toEqual(["a", "b"]);
  });
});
