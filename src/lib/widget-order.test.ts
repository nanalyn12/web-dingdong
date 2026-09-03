import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { MIN_TAP_TARGET_PX } from "./mobile-ui";
import { canMoveDown, canMoveUp, moveWidget } from "./widget-order";

/*
 * Batch ① — reordering the widget panel on a phone.
 *
 * The panel reordered by HTML5 drag-and-drop only (`draggable` +
 * onDragStart/onDragOver/onDragEnd). Those events never fire on touch, so on
 * the device the app was just tuned for, edit mode could add and remove
 * widgets but never reorder them.
 *
 * The move itself is pulled out here so it can be asserted without a DOM, and
 * so the button path and the drag path cannot drift apart: both call
 * `moveWidget` and both persist its result.
 */

describe("moveWidget", () => {
  // L1-1-1
  it("moves an item up and down by one slot", () => {
    expect(moveWidget(["a", "b", "c"], 1, "up")).toEqual(["b", "a", "c"]);
    expect(moveWidget(["a", "b", "c"], 1, "down")).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the input", () => {
    const input = ["a", "b", "c"];
    moveWidget(input, 1, "up");
    expect(input).toEqual(["a", "b", "c"]);
  });

  // L1-1-2 — the edges are reachable: the buttons are disabled there, but a
  // keyboard repeat or a stale index must not throw or drop an item.
  it("is a no-op at the edges and out of range", () => {
    expect(moveWidget(["a", "b", "c"], 0, "up")).toEqual(["a", "b", "c"]);
    expect(moveWidget(["a", "b", "c"], 2, "down")).toEqual(["a", "b", "c"]);
    expect(moveWidget(["a", "b", "c"], -1, "up")).toEqual(["a", "b", "c"]);
    expect(moveWidget(["a", "b", "c"], 3, "down")).toEqual(["a", "b", "c"]);
    expect(moveWidget([], 0, "up")).toEqual([]);
  });

  it("keeps every item — a move never loses or duplicates one", () => {
    const before = ["a", "b", "c", "d"];
    for (const i of [0, 1, 2, 3]) {
      for (const dir of ["up", "down"] as const) {
        expect([...moveWidget(before, i, dir)].sort()).toEqual([...before].sort());
      }
    }
  });
});

describe("canMoveUp / canMoveDown", () => {
  // L1-1-3
  it("disables the ends", () => {
    expect(canMoveUp(0)).toBe(false);
    expect(canMoveUp(1)).toBe(true);
    expect(canMoveDown(2, 3)).toBe(false);
    expect(canMoveDown(1, 3)).toBe(true);
  });

  it("disables both directions for a single item", () => {
    expect(canMoveUp(0)).toBe(false);
    expect(canMoveDown(0, 1)).toBe(false);
  });
});

/* ── 소스 가드 ─────────────────────────────────────────────────────────── */

const PANEL = fileURLToPath(new URL("../components/widget-panel.tsx", import.meta.url));

describe("widget-panel move controls", () => {
  // L1-1-4 — the tap-target floor is enforced by mobile-density.test.ts, but
  // its CONTROL regex only looks at <Button|SelectTrigger|Input|SpeakButton>.
  // The panel's own controls are raw <button>, which that guard walks past.
  // Requiring the move controls to be <Button> is what puts them back under
  // it, instead of restating the pixel rule in a second place.
  it("renders the move controls as <Button>, so the density guard sees them", () => {
    const source = readFileSync(PANEL, "utf8");
    const moveButtons = [...source.matchAll(/<Button\b[^>]*aria-label="(위로|아래로)[^"]*"/gs)];
    expect(moveButtons.map((m) => m[1]).sort()).toEqual(["아래로", "위로"]);
  });

  it("keeps the move controls at or above the tap-target floor", () => {
    const source = readFileSync(PANEL, "utf8");
    const offenders: string[] = [];
    for (const match of source.matchAll(
      /<Button\b[^>]*?aria-label="(?:위로|아래로)[^"]*"[^>]*?>|<Button\b[^>]*?className=(?:"([^"]*)")[^>]*?aria-label="(?:위로|아래로)/gs,
    )) {
      const className = /className="([^"]*)"/.exec(match[0])?.[1] ?? "";
      for (const token of className.split(/\s+/)) {
        if (token.includes(":")) continue; // md:/hover: are not the phone value
        const height = token.match(/^(?:h|size)-(\d+)$/);
        if (!height) continue;
        const px = Number(height[1]) * 4;
        if (px < MIN_TAP_TARGET_PX) offenders.push(`${token} = ${px}px`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // The regression the criteria calls the biggest one: the drag path saved in
  // onDragEnd, so a button path that only calls setLayout looks correct until
  // you reload. Both paths must go through persist().
  it("persists every reorder — no bare setLayout on the move path", () => {
    const source = readFileSync(PANEL, "utf8");
    expect(/persist\(\s*moveWidget\(/.test(source)).toBe(true);
  });
});
