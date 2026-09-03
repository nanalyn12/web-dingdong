import { describe, it, expect } from "vitest";

import {
  DEFAULT_LAYOUT,
  WIDGET_IDS,
  WIDGET_META,
  advanceQueue,
  pickDueWord,
  sanitizeLayout,
} from "./widget-catalog";

/*
 * Batch ④ — two more widgets, and the compatibility rules that adding any
 * widget has to obey.
 *
 * The saved layout is the fragile part. `profiles.widget_layout` holds ids
 * chosen when the set was five; every rule below exists so that widening the
 * set cannot rewrite what someone already arranged.
 */

describe("widget catalog", () => {
  it("carries the two new student widgets", () => {
    expect([...WIDGET_IDS]).toContain("vocab");
    expect([...WIDGET_IDS]).toContain("lesson");
  });

  // L1-4-6 — the ids and their titles used to be declared twice, in
  // widgets.functions.ts and again in widget-panel.tsx. A widget added to one
  // and not the other renders as a blank card.
  it("has exactly one meta entry per id and no orphans", () => {
    expect(Object.keys(WIDGET_META).sort()).toEqual([...WIDGET_IDS].sort());
  });

  it("offers the new word widget to accounts that never edited their layout", () => {
    expect(DEFAULT_LAYOUT).toContain("vocab");
    expect(DEFAULT_LAYOUT.every((id) => (WIDGET_IDS as readonly string[]).includes(id))).toBe(true);
  });
});

describe("sanitizeLayout", () => {
  // L1-4-2 — scenario A: an existing arrangement is returned untouched. The
  // new widgets must NOT be spliced into it.
  it("leaves a saved layout exactly as it was", () => {
    expect(sanitizeLayout(["quote", "stats", "calendar"])).toEqual(["quote", "stats", "calendar"]);
  });

  // L1-4-3 — scenario C
  it("drops unknown ids and preserves the order of the rest", () => {
    expect(sanitizeLayout(["quote", "zzz-unknown", "stats"])).toEqual(["quote", "stats"]);
    expect(sanitizeLayout(["song", "quote"])).toEqual(["song", "quote"]);
  });

  // L1-4-5 — scenario F: an empty layout is a choice, not a missing value.
  it("keeps an emptied layout empty", () => {
    expect(sanitizeLayout([])).toEqual([]);
  });

  // scenario B: never stored, or stored as something that is not a list.
  it("falls back to the default only when there is no layout at all", () => {
    expect(sanitizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(sanitizeLayout(undefined)).toEqual(DEFAULT_LAYOUT);
    expect(sanitizeLayout("quote")).toEqual(DEFAULT_LAYOUT);
    expect(sanitizeLayout({ 0: "quote" })).toEqual(DEFAULT_LAYOUT);
  });

  it("does not return the DEFAULT_LAYOUT array itself, so a caller cannot mutate it", () => {
    const out = sanitizeLayout(null);
    out.pop();
    expect(DEFAULT_LAYOUT).toContain("calendar");
  });

  it("removes duplicates — a widget renders once", () => {
    expect(sanitizeLayout(["quote", "quote", "stats"])).toEqual(["quote", "stats"]);
  });
});

/* ── 오늘의 단어 ───────────────────────────────────────────────────────── */

const WORDS = [
  { id: "a", zh: "学习" },
  { id: "b", zh: "老师" },
  { id: "c", zh: "朋友" },
];

describe("pickDueWord", () => {
  // L1-4-7 — the widget shows one card at a time. Which one has to be stable
  // across re-renders, or the card would swap under the learner's finger.
  it("is deterministic for the same list and day", () => {
    expect(pickDueWord(WORDS, 20260903)).toEqual(pickDueWord(WORDS, 20260903));
  });

  it("returns a word from the list", () => {
    expect(WORDS).toContainEqual(pickDueWord(WORDS, 20260903));
  });

  it("returns null for an empty list instead of throwing", () => {
    expect(pickDueWord([], 20260903)).toBeNull();
  });
});

describe("advanceQueue", () => {
  it("removes the graded word so it cannot come back immediately", () => {
    expect(advanceQueue(WORDS, "b")).toEqual([
      { id: "a", zh: "学习" },
      { id: "c", zh: "朋友" },
    ]);
  });

  it("is a no-op for an id that is not in the queue", () => {
    expect(advanceQueue(WORDS, "zzz")).toEqual(WORDS);
  });

  it("empties out cleanly on the last word", () => {
    expect(advanceQueue([{ id: "a", zh: "学习" }], "a")).toEqual([]);
  });
});
