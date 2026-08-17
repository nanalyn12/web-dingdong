import { describe, expect, it } from "vitest";

import {
  LEVEL_LABEL,
  LEVEL_LABEL_HSK,
  LEVEL_OPTIONS,
  LEVEL_ORDER,
  isLevel,
  levelLabel,
  levelLabelHsk,
} from "./levels";

describe("isLevel", () => {
  it("정해진 세 값만 레벨로 인정한다", () => {
    expect(isLevel("beginner")).toBe(true);
    expect(isLevel("intermediate")).toBe(true);
    expect(isLevel("advanced")).toBe(true);
  });

  it("그 밖의 값은 거부한다", () => {
    expect(isLevel("expert")).toBe(false);
    expect(isLevel("")).toBe(false);
    expect(isLevel(null)).toBe(false);
    expect(isLevel(undefined)).toBe(false);
    expect(isLevel(1)).toBe(false);
  });
});

describe("levelLabel", () => {
  it("아는 레벨은 한국어 라벨로 바꾼다", () => {
    expect(levelLabel("beginner")).toBe("초급");
    expect(levelLabel("intermediate")).toBe("중급");
    expect(levelLabel("advanced")).toBe("고급");
  });

  it("모르는 값은 지우지 않고 그대로 보여준다", () => {
    // 빈 화면보다 예상 밖의 값이 보이는 편이 원인 파악에 낫다.
    expect(levelLabel("expert")).toBe("expert");
  });

  it("값이 없으면 빈 문자열이다", () => {
    expect(levelLabel(null)).toBe("");
    expect(levelLabel(undefined)).toBe("");
  });
});

describe("levelLabelHsk", () => {
  it("HSK 급수를 괄호로 덧붙인다", () => {
    expect(levelLabelHsk("beginner")).toBe("초급 (HSK 1~3급)");
    expect(levelLabelHsk("advanced")).toBe("고급 (HSK 7~9급)");
  });

  it("모르는 값과 빈 값은 levelLabel과 같게 처리한다", () => {
    expect(levelLabelHsk("expert")).toBe("expert");
    expect(levelLabelHsk(null)).toBe("");
  });
});

describe("레벨 상수", () => {
  it("쉬운 순서로 정렬돼 있다", () => {
    expect(LEVEL_ORDER).toEqual(["beginner", "intermediate", "advanced"]);
  });

  it("모든 레벨이 라벨을 갖는다", () => {
    for (const level of LEVEL_ORDER) {
      expect(LEVEL_LABEL[level].length).toBeGreaterThan(0);
      expect(LEVEL_LABEL_HSK[level]).toContain(LEVEL_LABEL[level]);
    }
  });

  it("셀렉트 옵션이 정렬 순서와 라벨을 그대로 따른다", () => {
    expect(LEVEL_OPTIONS).toEqual([
      { value: "beginner", label: "초급" },
      { value: "intermediate", label: "중급" },
      { value: "advanced", label: "고급" },
    ]);
  });
});
