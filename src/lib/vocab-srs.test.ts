import { describe, expect, it } from "vitest";

import { applyGrade, daysUntilDue, initialSrs, srsStatus, type SrsState } from "./vocab-srs";

const NOW = new Date("2026-08-09T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

/** ISO of `days` after NOW — the shape dueAt is stored in. */
function due(days: number): string {
  return new Date(NOW.getTime() + days * DAY).toISOString();
}

describe("initialSrs", () => {
  it("처음 만든 카드는 지금 바로 복습 대상이다", () => {
    const state = initialSrs(NOW);
    expect(state).toEqual({
      ease: 2.5,
      intervalDays: 0,
      reps: 0,
      lapses: 0,
      dueAt: NOW.toISOString(),
    });
  });
});

describe("applyGrade — 암기(2)", () => {
  it("첫 정답의 간격은 1일이다", () => {
    const state = applyGrade(initialSrs(NOW), 2, NOW);
    expect(state.reps).toBe(1);
    expect(state.intervalDays).toBe(1);
    expect(state.dueAt).toBe(due(1));
  });

  it("두 번째 정답의 간격은 3일이다", () => {
    const state = applyGrade(applyGrade(initialSrs(NOW), 2, NOW), 2, NOW);
    expect(state.reps).toBe(2);
    expect(state.intervalDays).toBe(3);
    expect(state.dueAt).toBe(due(3));
  });

  it("세 번째부터는 간격에 ease를 곱해 늘어난다", () => {
    let state = initialSrs(NOW);
    for (let i = 0; i < 3; i++) state = applyGrade(state, 2, NOW);
    // ease 2.5 → 2.55 → 2.60 → 2.65, interval 3 × 2.65
    expect(state.ease).toBeCloseTo(2.65, 10);
    expect(state.intervalDays).toBeCloseTo(7.95, 10);
  });

  it("정답마다 ease가 0.05씩 오른다", () => {
    expect(applyGrade(initialSrs(NOW), 2, NOW).ease).toBeCloseTo(2.55, 10);
  });

  it("복습 시각을 기록한다", () => {
    expect(applyGrade(initialSrs(NOW), 2, NOW).lastReviewedAt).toBe(NOW.toISOString());
  });
});

describe("applyGrade — 헷갈림(1)", () => {
  it("첫 응답이면 간격이 1일이다", () => {
    const state = applyGrade(initialSrs(NOW), 1, NOW);
    expect(state.intervalDays).toBe(1);
    expect(state.ease).toBeCloseTo(2.45, 10);
  });

  it("이미 익숙한 카드는 간격이 1.2배로만 늘어난다", () => {
    const learned: SrsState = {
      ease: 2.5,
      intervalDays: 10,
      reps: 3,
      lapses: 0,
      dueAt: NOW.toISOString(),
    };
    expect(applyGrade(learned, 1, NOW).intervalDays).toBeCloseTo(12, 10);
  });
});

describe("applyGrade — 모름(0)", () => {
  it("반복 횟수가 초기화되고 실패가 누적된다", () => {
    const learned: SrsState = {
      ease: 2.5,
      intervalDays: 30,
      reps: 5,
      lapses: 1,
      dueAt: NOW.toISOString(),
    };
    const state = applyGrade(learned, 0, NOW);
    expect(state.reps).toBe(0);
    expect(state.lapses).toBe(2);
    expect(state.intervalDays).toBe(0);
    expect(state.dueAt).toBe(NOW.toISOString()); // 같은 세션에서 다시 나온다
  });

  it("ease가 0.2 깎이되 1.3 아래로는 내려가지 않는다", () => {
    const hard: SrsState = {
      ease: 1.4,
      intervalDays: 1,
      reps: 1,
      lapses: 0,
      dueAt: NOW.toISOString(),
    };
    expect(applyGrade(hard, 0, NOW).ease).toBe(1.3);
    expect(applyGrade(applyGrade(hard, 0, NOW), 0, NOW).ease).toBe(1.3);
  });
});

describe("srsStatus", () => {
  const base: SrsState = {
    ease: 2.5,
    intervalDays: 5,
    reps: 2,
    lapses: 0,
    dueAt: due(3),
  };

  it("상태가 없으면 새 단어다", () => {
    expect(srsStatus(undefined, NOW)).toBe("new");
  });

  it("한 번도 복습하지 않았으면 새 단어다", () => {
    expect(srsStatus({ ...base, reps: 0 }, NOW)).toBe("new");
  });

  it("복습 시각이 지났으면 due다", () => {
    expect(srsStatus({ ...base, dueAt: due(-1) }, NOW)).toBe("due");
  });

  it("간격이 21일 이상이면 학습 완료로 본다", () => {
    expect(srsStatus({ ...base, intervalDays: 21 }, NOW)).toBe("learned");
  });

  it("그 사이는 학습 중이다", () => {
    expect(srsStatus(base, NOW)).toBe("learning");
  });
});

describe("daysUntilDue", () => {
  it("상태가 없으면 0일이다", () => {
    expect(daysUntilDue(undefined, NOW)).toBe(0);
  });

  it("남은 시간은 올림해서 일 단위로 센다", () => {
    const state: SrsState = {
      ease: 2.5,
      intervalDays: 4,
      reps: 2,
      lapses: 0,
      dueAt: due(3.2),
    };
    expect(daysUntilDue(state, NOW)).toBe(4);
  });

  it("이미 지난 카드는 음수가 아니라 0이다", () => {
    const state: SrsState = {
      ease: 2.5,
      intervalDays: 4,
      reps: 2,
      lapses: 0,
      dueAt: due(-9),
    };
    expect(daysUntilDue(state, NOW)).toBe(0);
  });
});
