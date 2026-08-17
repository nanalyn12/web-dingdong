import { describe, expect, it } from "vitest";

import { rewrapSrt, splitSentences, wrapSubtitle } from "./subtitles";

describe("splitSentences", () => {
  it("중국어 문장부호는 뒤에 공백이 없어도 나눈다", () => {
    expect(splitSentences("你好。我叫小明。你呢？")).toEqual(["你好。", "我叫小明。", "你呢？"]);
  });

  it("영문 마침표는 공백이 있을 때만 나눈다", () => {
    // "3.5초", "Dr. Wang"이 쪼개지면 TTS가 엉뚱하게 끊어 읽는다.
    expect(splitSentences("길이는 3.5초입니다. 다음 장면입니다.")).toEqual([
      "길이는 3.5초입니다.",
      "다음 장면입니다.",
    ]);
  });

  it("따옴표가 닫히기 전에는 문장이 끝나지 않은 것으로 본다", () => {
    expect(splitSentences('"你吃饭了吗？"라고 인사해요.')).toEqual([
      '"你吃饭了吗？"라고 인사해요.',
    ]);
  });

  it("빈 조각은 버린다", () => {
    expect(splitSentences("안녕하세요.   \n\n  반갑습니다.")).toEqual([
      "안녕하세요.",
      "반갑습니다.",
    ]);
  });

  it("빈 입력은 빈 배열이다", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   ")).toEqual([]);
  });

  it("문장부호가 없으면 통째로 한 문장이다", () => {
    expect(splitSentences("자막 한 줄")).toEqual(["자막 한 줄"]);
  });
});

describe("wrapSubtitle", () => {
  it("짧으면 그대로 한 줄이다", () => {
    expect(wrapSubtitle("안녕하세요")).toBe("안녕하세요");
  });

  it("한국어는 공백에서 끊어 두 줄로 만든다", () => {
    const wrapped = wrapSubtitle("오늘은 중국어로 인사하는 방법을 배워봅니다 함께 따라 읽어보세요");
    const lines = wrapped.split("\n");
    expect(lines.length).toBe(2);
    expect(lines.every((line) => line.length > 0)).toBe(true);
  });

  it("자막은 절대 세 줄을 넘지 않는다", () => {
    const long = "가나다라마바사 ".repeat(20);
    expect(wrapSubtitle(long).split("\n").length).toBeLessThanOrEqual(2);
  });

  it("공백 없는 중국어는 폭으로 자른다", () => {
    const wrapped = wrapSubtitle("我今天早上去了学校然后和朋友一起吃了午饭真的很开心");
    expect(wrapped.split("\n").length).toBe(2);
  });

  it("연속 공백은 하나로 정리한다", () => {
    expect(wrapSubtitle("  안녕   하세요  ")).toBe("안녕 하세요");
  });
});

describe("rewrapSrt", () => {
  const srt = [
    "1",
    "00:00:00,000 --> 00:00:03,000",
    "오늘은 중국어로 인사하는 방법을 배워봅니다 함께 따라 읽어보세요",
    "",
    "2",
    "00:00:03,000 --> 00:00:05,000",
    "你好",
  ].join("\n");

  it("타이밍 줄은 건드리지 않는다", () => {
    const out = rewrapSrt(srt);
    expect(out).toContain("00:00:00,000 --> 00:00:03,000");
    expect(out).toContain("00:00:03,000 --> 00:00:05,000");
  });

  it("긴 자막만 두 줄로 다시 감싼다", () => {
    const blocks = rewrapSrt(srt).split("\n\n");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].split("\n").length).toBe(4); // 번호 + 타이밍 + 본문 2줄
    expect(blocks[1].split("\n").length).toBe(3);
  });

  it("타이밍이 없는 블록은 손대지 않는다", () => {
    const broken = "1\n본문만 있는 블록";
    expect(rewrapSrt(broken)).toBe(broken);
  });

  it("빈 입력은 빈 문자열이다", () => {
    expect(rewrapSrt("")).toBe("");
  });
});
