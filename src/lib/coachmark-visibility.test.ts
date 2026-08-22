import { describe, it, expect } from "vitest";

import { shouldAutoRunTour } from "./coachmark-visibility";

describe("when a tour may start on its own", () => {
  // L1-1 — driver.js anchors a popover beside its target. On a 375px screen
  // there is no beside, so the popover lands on top of the thing it is
  // pointing at and its buttons render at 28px.
  it("stays out of the way on a phone", () => {
    expect(shouldAutoRunTour(375)).toBe(false);
    expect(shouldAutoRunTour(414)).toBe(false);
    expect(shouldAutoRunTour(767)).toBe(false);
  });

  it("runs from the md breakpoint up, where the sidebar it describes exists", () => {
    expect(shouldAutoRunTour(768)).toBe(true);
    expect(shouldAutoRunTour(1119)).toBe(true);
    expect(shouldAutoRunTour(1920)).toBe(true);
  });

  it("does not run when the width is unknown", () => {
    // Server render: no viewport to measure, so nothing should auto-start.
    expect(shouldAutoRunTour(undefined)).toBe(false);
  });
});
