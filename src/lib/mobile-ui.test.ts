import { describe, it, expect } from "vitest";

import {
  BUTTON_SIZE_CLASSES,
  CONTROL_HEIGHT_CLASS,
  DIALOG_CONTENT_CLASS,
  MIN_TAP_TARGET_PX,
  MOBILE_TEXT_INPUT_CLASS,
  SPEAK_BUTTON_SIZE_CLASSES,
  TABS_TRIGGER_CLASS,
  VIEWPORT_CONTENT,
} from "./mobile-ui";

/*
 * A tiny Tailwind resolver. It exists because the acceptance criteria for this
 * batch are stated in pixels ("a tap target is at least 44px") while the code
 * states them in class names. Without turning one into the other the criteria
 * cannot be checked by a machine, and a rule that only a human can check is a
 * rule that quietly loosens.
 *
 * Scope is deliberately narrow: the height/width/font-size utilities actually
 * used by the primitives below, at the two viewports we care about.
 */

type Viewport = "mobile" | "desktop";

/** Tokens that apply at `viewport`, in cascade order (base first, then md:). */
function applicableTokens(classes: string, viewport: Viewport): string[] {
  const tokens = classes.split(/\s+/).filter(Boolean);
  // A phone is below every responsive breakpoint, so only unprefixed utilities
  // apply. Tokens carrying any variant prefix (md:, hover:, data-[…]:) are not
  // unconditional and are ignored for sizing.
  const base = tokens.filter((t) => !t.includes(":"));
  if (viewport === "mobile") return base;
  return [...base, ...tokens.filter((t) => t.startsWith("md:")).map((t) => t.slice(3))];
}

/** Tailwind spacing step → px (`h-11` → 44). Non-numeric scales return null. */
function spacingPx(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n * 4 : null;
}

/**
 * The height the element is guaranteed to occupy: an explicit `h-*` wins, and
 * `min-h-*` is the floor when the height is otherwise content-driven.
 */
function resolvedSizePx(classes: string, viewport: Viewport, axis: "h" | "w"): number | null {
  let fixed: number | null = null;
  let floor: number | null = null;
  for (const token of applicableTokens(classes, viewport)) {
    const fixedMatch = token.match(new RegExp(`^${axis}-(.+)$`));
    if (fixedMatch) fixed = spacingPx(fixedMatch[1]);
    const floorMatch = token.match(new RegExp(`^min-${axis}-(.+)$`));
    if (floorMatch) floor = spacingPx(floorMatch[1]);
  }
  return fixed ?? floor;
}

const FONT_SCALE_PX: Record<string, number> = {
  "text-xs": 12,
  "text-sm": 14,
  "text-base": 16,
  "text-lg": 18,
  "text-xl": 20,
};

function resolvedFontPx(classes: string, viewport: Viewport): number | null {
  let px: number | null = null;
  for (const token of applicableTokens(classes, viewport)) {
    if (token in FONT_SCALE_PX) px = FONT_SCALE_PX[token];
  }
  return px;
}

const BUTTON_SIZES = ["default", "xs", "sm", "lg", "icon"] as const;

describe("button tap targets", () => {
  // L1-1
  it.each(BUTTON_SIZES)("size %s reaches the tap-target floor on a phone", (size) => {
    expect(resolvedSizePx(BUTTON_SIZE_CLASSES[size], "mobile", "h")).toBeGreaterThanOrEqual(
      MIN_TAP_TARGET_PX,
    );
  });

  // L1-2 — the desktop density must not drift while we fix the phone.
  it.each([
    ["default", 36],
    ["xs", 28],
    ["sm", 32],
    ["lg", 40],
    ["icon", 36],
  ] as const)("size %s keeps its %ipx height on desktop", (size, px) => {
    expect(resolvedSizePx(BUTTON_SIZE_CLASSES[size], "desktop", "h")).toBe(px);
  });

  // L1-3
  it("icon buttons are square at both viewports", () => {
    expect(resolvedSizePx(BUTTON_SIZE_CLASSES.icon, "mobile", "w")).toBeGreaterThanOrEqual(
      MIN_TAP_TARGET_PX,
    );
    expect(resolvedSizePx(BUTTON_SIZE_CLASSES.icon, "desktop", "w")).toBe(36);
  });
});

describe("single-line form controls", () => {
  // L1-9 — Input and the Select trigger share this height and sit in the same
  // rows as buttons, so they follow the same floor.
  it("reach the tap-target floor on a phone", () => {
    expect(resolvedSizePx(CONTROL_HEIGHT_CLASS, "mobile", "h")).toBeGreaterThanOrEqual(
      MIN_TAP_TARGET_PX,
    );
  });

  it("keep their 36px height on desktop", () => {
    expect(resolvedSizePx(CONTROL_HEIGHT_CLASS, "desktop", "h")).toBe(36);
  });
});

describe("tabs tap targets", () => {
  // L1-4
  it("a tab trigger reaches the tap-target floor on a phone", () => {
    expect(resolvedSizePx(TABS_TRIGGER_CLASS, "mobile", "h")).toBeGreaterThanOrEqual(
      MIN_TAP_TARGET_PX,
    );
  });

  it("a tab trigger steps back down for desktop", () => {
    expect(TABS_TRIGGER_CLASS).toMatch(/\bmd:(min-)?h-/);
  });
});

describe("dialog geometry on a phone", () => {
  const mobileTokens = applicableTokens(DIALOG_CONTENT_CLASS, "mobile");

  // L1-5
  it("leaves a gutter instead of spanning the full width", () => {
    expect(mobileTokens).not.toContain("w-full");
  });

  it("is rounded at the phone viewport, not only from sm: up", () => {
    expect(mobileTokens.some((t) => /^rounded(-|$)/.test(t))).toBe(true);
  });

  it("bounds its height in dvh so the URL bar cannot clip it", () => {
    const maxHeight = mobileTokens.find((t) => t.startsWith("max-h-"));
    expect(maxHeight).toBeDefined();
    // `dvh` tracks the URL bar; plain `vh` is measured against the largest
    // viewport and leaves the bottom of the dialog behind the browser chrome.
    expect(maxHeight).toContain("dvh");
  });
});

describe("text inputs outside ui/input", () => {
  // L1-6
  it("renders at 16px on a phone so iOS does not zoom on focus", () => {
    expect(resolvedFontPx(MOBILE_TEXT_INPUT_CLASS, "mobile")).toBeGreaterThanOrEqual(16);
  });

  it("steps down to the denser desktop size", () => {
    expect(resolvedFontPx(MOBILE_TEXT_INPUT_CLASS, "desktop")).toBe(14);
  });
});

describe("the speak-aloud pill", () => {
  // L1-1
  it.each(["sm", "md"] as const)("size %s reaches the tap-target floor on a phone", (size) => {
    expect(resolvedSizePx(SPEAK_BUTTON_SIZE_CLASSES[size], "mobile", "h")).toBeGreaterThanOrEqual(
      MIN_TAP_TARGET_PX,
    );
  });

  // L1-2 — inline beside Chinese text, the desktop pill must not grow.
  it.each([
    ["sm", ["px-2", "py-0.5", "text-[11px]"]],
    ["md", ["px-2.5", "py-1", "text-xs"]],
  ] as const)("size %s keeps its desktop padding and type", (size, expected) => {
    const desktop = applicableTokens(SPEAK_BUTTON_SIZE_CLASSES[size], "desktop");
    for (const token of expected) expect(desktop).toContain(token);
  });

  // L1-3
  it.each(["sm", "md"] as const)("size %s steps back down at md", (size) => {
    expect(SPEAK_BUTTON_SIZE_CLASSES[size]).toContain("md:");
  });
});

describe("viewport meta", () => {
  // L1-7
  it("opts into the display cutout so safe-area insets are reported", () => {
    expect(VIEWPORT_CONTENT).toContain("viewport-fit=cover");
  });

  it("keeps the scaling defaults", () => {
    expect(VIEWPORT_CONTENT).toContain("width=device-width");
    expect(VIEWPORT_CONTENT).toContain("initial-scale=1");
  });
});
