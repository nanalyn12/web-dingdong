import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { tabsAfterQuiz, tabsAfterVisit } from "./lesson-progress";

/*
 * Opening a lesson tab marks it as studied. That is a fair reading for the
 * content tabs, but it made the quiz "studied" the moment its tab opened: on
 * 2026-09-22, 17 of 35 server progress rows listed "quiz" and one of them had
 * a score. The study-report PDF printed "✅ 학습한 섹션: 퀴즈" for a quiz
 * nobody had answered. The quiz now counts only once it has been finished.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));

describe("which tabs a visit marks as studied", () => {
  // E-1
  it("records a content tab the first time it opens", () => {
    expect(tabsAfterVisit([], "content")).toEqual(["content"]);
  });

  // E-2
  it("changes nothing on a second visit", () => {
    expect(tabsAfterVisit(["content"], "content")).toBeNull();
  });

  // E-3
  it("does not count the quiz as studied just for being opened", () => {
    expect(tabsAfterVisit([], "quiz")).toBeNull();
    expect(tabsAfterVisit(["content", "key"], "quiz")).toBeNull();
  });

  // E-4
  it("counts the quiz once it has been finished", () => {
    expect(tabsAfterQuiz(["content"])).toEqual(["content", "quiz"]);
    expect(tabsAfterQuiz(["content", "quiz"])).toEqual(["content", "quiz"]);
  });
});

describe("the lesson page decides this in one place", () => {
  // E-5
  it("the tab-visit effect goes through tabsAfterVisit", () => {
    const src = readFileSync(join(SRC, "routes/_app.lessons.$id.tsx"), "utf8");
    expect(src).toMatch(/tabsAfterVisit\(/);
    expect(src).not.toMatch(/!completedTabs\.includes\(tab\)/);
  });
});
