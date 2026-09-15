import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { navItemsFor } from "./nav-items";

/*
 * The studio's hints point at other controls by name — "[작업 현황] 탭에서
 * 확인하세요". One of them recommended "[승인 후 업로드]", an upload mode that
 * never existed under that name; the option reads "미리보기 후 승인 업로드".
 * A teacher looking for the named option finds nothing.
 *
 * Every [label] must be text the screen actually shows: a tab, an option, a
 * button, or a sidebar menu title.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const STUDIO = readFileSync(join(SRC, "routes/_app.studio.tsx"), "utf8");

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `label` rendered as its own text: after `>` or whitespace, before `<`, `{` or a line end. */
function shownOnScreen(label: string): boolean {
  return new RegExp(`(^|[>\\s])${escape(label)}\\s*([<{]|$)`, "m").test(STUDIO);
}

function bracketRefs(): { label: string; line: number }[] {
  return [...STUDIO.matchAll(/\[([가-힣][^\]\n]*)\]/g)].map((m) => ({
    label: m[1],
    line: STUDIO.slice(0, m.index).split("\n").length,
  }));
}

describe("studio hints name real controls", () => {
  it("finds the hints it is guarding", () => {
    expect(bracketRefs().length).toBeGreaterThanOrEqual(5);
  });

  // L1-1
  it("names only labels the screen or the menu shows", () => {
    const menu = new Set(navItemsFor("teacher").map((i) => i.title));
    const broken = bracketRefs()
      .filter(({ label }) => !shownOnScreen(label) && !menu.has(label))
      .map(({ label, line }) => `src/routes/_app.studio.tsx:${line}  [${label}]`);
    expect(broken).toEqual([]);
  });

  // L1-2
  it("recommends the approval upload mode by its option name", () => {
    expect(STUDIO).toMatch(/하루 약 6개 한도가 있어요[^[]*\[미리보기 후 승인 업로드\]/);
  });
});
