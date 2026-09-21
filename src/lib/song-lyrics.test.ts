import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { isSectionHeader, orderPuzzleLines, sungLines } from "./song-lyrics";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

const line = (zh: string) => ({ zh, pinyin: "", ko: "" });

/** 운영 DB 학습송의 실제 구조: [Verse 1] 4줄, [Chorus] 4줄, [Verse 2] 4줄, [Chorus] 4줄. */
const SONG = [
  line("[Verse 1]"),
  line("比赛就要开始了"),
  line("大家都很有信心"),
  line("进球得分太漂亮"),
  line("看过来看过来"),
  line("[Chorus]"),
  line("我们一定会赢的"),
  line("只要努力不放弃"),
  line("时刻又得分"),
  line("冠军就是我们"),
  line("[Verse 2]"),
  line("第二段第一句"),
  line("第二段第二句"),
  line("第二段第三句"),
  line("第二段第四句"),
  line("[Chorus]"),
  line("我们一定会赢的"),
  line("只要努力不放弃"),
  line("时刻又得分"),
  line("冠军就是我们"),
];

describe("what counts as a sung lyric line", () => {
  // B-1
  it("recognises section markers", () => {
    expect(isSectionHeader("[Verse 1]")).toBe(true);
    expect(isSectionHeader("[Chorus]")).toBe(true);
    expect(isSectionHeader(" [Bridge] ")).toBe(true);
  });

  it("does not mistake a lyric, or nothing, for a marker", () => {
    expect(isSectionHeader("我[爱]你")).toBe(false);
    expect(isSectionHeader("")).toBe(false);
    expect(isSectionHeader(null)).toBe(false);
    expect(isSectionHeader(undefined)).toBe(false);
  });

  // B-2
  it("keeps only the sung lines, in their order", () => {
    const withBlank = [line("[Verse 1]"), line("第一句"), line("   "), line("第二句")];
    expect(sungLines(withBlank).map((l) => l.zh)).toEqual(["第一句", "第二句"]);
    // 20 raw lines, 4 of them markers.
    expect(sungLines(SONG)).toHaveLength(16);
  });
});

describe("the line-order puzzle", () => {
  // B-3
  it("never asks the learner to place a section marker", () => {
    const puzzle = orderPuzzleLines(SONG);
    expect(puzzle.some((l) => isSectionHeader(l.zh))).toBe(false);
    expect(puzzle).toHaveLength(6);
    expect(puzzle.map((l) => l.zh)).toEqual([
      "比赛就要开始了",
      "大家都很有信心",
      "进球得分太漂亮",
      "看过来看过来",
      "我们一定会赢的",
      "只要努力不放弃",
    ]);
  });

  // B-4
  it("makes no puzzle from fewer than three sung lines", () => {
    const tiny = [line("[Verse 1]"), line("一"), line("[Chorus]"), line("二")];
    expect(orderPuzzleLines(tiny)).toEqual([]);
  });
});

describe("the song screens decide 'is this a lyric' in one place", () => {
  // B-5
  it("the detail screen builds the puzzle from sung lines, not raw lines", () => {
    const src = read("routes/_app.songs.$id.tsx");
    expect(src).not.toMatch(/lyrics\.slice\(0,/);
    expect(src).not.toMatch(/function isSectionHeader/);
    expect(src).toMatch(/orderPuzzleLines\(/);
  });

  // B-6
  it("the list card counts sung lines", () => {
    const src = read("routes/_app.songs.index.tsx");
    expect(src).not.toMatch(/가사 \$\{[^}]*lyrics\.length/);
    expect(src).toMatch(/sungLines\(/);
  });
});
