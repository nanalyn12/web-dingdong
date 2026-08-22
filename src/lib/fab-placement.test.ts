import { describe, it, expect } from "vitest";

import { clampFabY, FAB_MARGIN } from "./fab-placement";

const PHONE = { viewportHeight: 812, fabHeight: 64 };
/** iPhone home-indicator strip. */
const INSET = 34;

describe("where the floating button may rest", () => {
  // L1-3
  it("keeps the button clear of the top edge", () => {
    expect(clampFabY({ ...PHONE, bottomInset: 0, y: -200 })).toBe(FAB_MARGIN);
  });

  it("keeps the button clear of the bottom edge", () => {
    const y = clampFabY({ ...PHONE, bottomInset: 0, y: 10_000 });
    expect(y + PHONE.fabHeight).toBeLessThanOrEqual(PHONE.viewportHeight - FAB_MARGIN);
  });

  it("does not let the button sit on the home indicator", () => {
    const y = clampFabY({ ...PHONE, bottomInset: INSET, y: 10_000 });
    // The strip is the browser's; the button has to stay above it.
    expect(y + PHONE.fabHeight).toBeLessThanOrEqual(PHONE.viewportHeight - INSET - FAB_MARGIN);
  });

  it("gives back a lower resting spot once an inset appears", () => {
    const without = clampFabY({ ...PHONE, bottomInset: 0, y: 10_000 });
    const withInset = clampFabY({ ...PHONE, bottomInset: INSET, y: 10_000 });
    expect(withInset).toBe(without - INSET);
  });

  it("leaves a spot that already fits untouched", () => {
    expect(clampFabY({ ...PHONE, bottomInset: INSET, y: 300 })).toBe(300);
  });

  // L1-4 — a landscape phone with the keyboard up can be shorter than the
  // button plus both margins, which makes the lower bound exceed the upper one.
  it("stays finite when the viewport is shorter than the button", () => {
    const y = clampFabY({ viewportHeight: 80, fabHeight: 64, bottomInset: 34, y: 500 });
    expect(Number.isFinite(y)).toBe(true);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  // L1-7 — the phone tab bar occupies the bottom of the screen; the button
  // has to stay above it, not behind it.
  it("stays above chrome the page reserves at the bottom", () => {
    const y = clampFabY({ ...PHONE, bottomInset: 0, bottomReserved: 56, y: 10_000 });
    expect(y + PHONE.fabHeight).toBeLessThanOrEqual(PHONE.viewportHeight - 56 - FAB_MARGIN);
  });

  it("adds the reserved strip to the safe-area inset rather than picking one", () => {
    const y = clampFabY({ ...PHONE, bottomInset: INSET, bottomReserved: 56, y: 10_000 });
    expect(y + PHONE.fabHeight).toBeLessThanOrEqual(PHONE.viewportHeight - INSET - 56 - FAB_MARGIN);
  });

  // L1-8 — desktop reserves nothing, so nothing may move.
  it("is unchanged when the page reserves nothing", () => {
    expect(clampFabY({ ...PHONE, bottomInset: 0, bottomReserved: 0, y: 10_000 })).toBe(
      clampFabY({ ...PHONE, bottomInset: 0, y: 10_000 }),
    );
  });

  it("ignores a nonsense inset rather than flinging the button off screen", () => {
    const y = clampFabY({ ...PHONE, bottomInset: Number.NaN, y: 10_000 });
    expect(y).toBe(clampFabY({ ...PHONE, bottomInset: 0, y: 10_000 }));
  });
});
