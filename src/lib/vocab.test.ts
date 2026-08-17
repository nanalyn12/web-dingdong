import { describe, expect, it } from "vitest";

import { guessEmoji, normalizeZh, scorePronunciation } from "./vocab";

describe("normalizeZh", () => {
  it("공백과 문장부호를 걷어낸다", () => {
    expect(normalizeZh("我 爱 你。")).toBe("我爱你");
    expect(normalizeZh("你好，世界！")).toBe("你好世界");
  });

  it("영문은 소문자로 맞춘다", () => {
    expect(normalizeZh("Ni Hao")).toBe("nihao");
  });

  it("빈 문자열은 그대로 빈 문자열이다", () => {
    expect(normalizeZh("")).toBe("");
    expect(normalizeZh("  ")).toBe("");
  });
});

describe("scorePronunciation", () => {
  it("정확히 같으면 만점이다", () => {
    expect(scorePronunciation("我爱你", "我爱你")).toBe(1);
  });

  it("공백·문장부호 차이는 감점하지 않는다", () => {
    expect(scorePronunciation("我爱你。", "我 爱 你")).toBe(1);
  });

  it("일부만 맞으면 부분 점수가 나온다", () => {
    const score = scorePronunciation("我爱你", "我爱");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("전혀 다르면 0점이다", () => {
    expect(scorePronunciation("我爱你", "苹果")).toBe(0);
  });

  it("한쪽이 비면 0점이다", () => {
    expect(scorePronunciation("", "我爱你")).toBe(0);
    expect(scorePronunciation("我爱你", "")).toBe(0);
    expect(scorePronunciation("。。", "我")).toBe(0);
  });

  it("현재 채점은 글자 순서를 보지 않는다 (알려진 느슨함)", () => {
    // 집합 포함 여부로만 세기 때문에 순서를 뒤집거나 정답 글자를 반복해도
    // 만점이 나온다. 발음 연습의 격려 성격상 지금은 이 느슨함을 유지하고,
    // 엄격하게 바꾼다면 이 테스트가 먼저 깨지도록 남겨 둔다.
    expect(scorePronunciation("我爱你", "你爱我")).toBe(1);
    expect(scorePronunciation("我", "我我我我")).toBe(1);
  });

  it("점수는 항상 0과 1 사이다", () => {
    for (const [target, heard] of [
      ["我爱你", "你爱我"],
      ["苹果", "苹果苹果"],
      ["hello", "hello world"],
    ]) {
      const score = scorePronunciation(target, heard);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

describe("guessEmoji", () => {
  it("아는 단어는 뜻에 맞는 이모지를 준다", () => {
    expect(guessEmoji("你好")).toBe("👋");
    expect(guessEmoji("谢谢")).toBe("🙏");
    expect(guessEmoji("咖啡")).toBe("☕");
  });

  it("한국어 뜻만 보고도 고른다", () => {
    expect(guessEmoji("xxx", "학교")).toBe("🏫");
  });

  it("모르는 짧은 단어는 기본 이모지로 채운다", () => {
    expect(guessEmoji("甲乙")).toBe("✨");
    expect(guessEmoji("甲乙丙丁")).toBe("💬");
    expect(guessEmoji("甲乙丙丁戊己")).toBe("📝");
  });

  it("항상 무언가를 돌려준다 — 빈 값이 나오지 않는다", () => {
    for (const word of ["", "a", "测试文本内容"]) {
      expect(guessEmoji(word).length).toBeGreaterThan(0);
    }
  });
});
