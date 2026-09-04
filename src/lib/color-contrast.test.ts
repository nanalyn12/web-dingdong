import { describe, it, expect } from "vitest";

import {
  AA_CONTRAST,
  contrastOf,
  contrastRatio,
  oklchToRgb,
  over,
  parseOklch,
} from "./color-contrast";

/*
 * The conversion has to agree with a browser, or every contrast assertion
 * built on it is decoration. The expected numbers below were measured in
 * Chrome during batch 8 and 10 by filling a canvas with the same oklch strings
 * and reading the pixel back; they are reproduced here as fixtures.
 */

describe("parseOklch", () => {
  it("reads the forms the design system actually uses", () => {
    expect(parseOklch("oklch(0.28 0.045 285)")).toEqual({ l: 0.28, c: 0.045, h: 285, alpha: 1 });
    expect(parseOklch("oklch(1 0 0 / 80%)")).toEqual({ l: 1, c: 0, h: 0, alpha: 0.8 });
    expect(parseOklch("oklch(98.5% 0.012 320)")?.l).toBeCloseTo(0.985, 5);
  });

  it("returns null for anything else instead of throwing", () => {
    for (const bad of ["#fff", "rgb(0,0,0)", "", "oklch()", "var(--foreground)"]) {
      expect(parseOklch(bad)).toBeNull();
    }
  });
});

describe("oklchToRgb", () => {
  it("puts the achromatic ends where they belong", () => {
    expect(oklchToRgb({ l: 1, c: 0, h: 0, alpha: 1 }).map(Math.round)).toEqual([255, 255, 255]);
    expect(oklchToRgb({ l: 0, c: 0, h: 0, alpha: 1 }).map(Math.round)).toEqual([0, 0, 0]);
  });

  it("agrees with the browser on the tokens measured in batch 8", () => {
    // --foreground (dark) over the middle stop of the dark app gradient.
    const measured = 14.48;
    const ratio = contrastOf("oklch(0.96 0.01 300)", "oklch(0.24 0.05 230)");
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeCloseTo(measured, 0);
  });

  it("agrees with the browser on a translucent surface", () => {
    // --muted-foreground on --surface at 50% over the same gradient stop.
    const bg = over(
      oklchToRgb(parseOklch("oklch(0.34 0.035 290)")!),
      0.5,
      oklchToRgb(parseOklch("oklch(0.24 0.05 230)")!),
    );
    const fg = oklchToRgb(parseOklch("oklch(0.75 0.03 290)")!);
    expect(contrastRatio(fg, bg)).toBeCloseTo(6.33, 0);
  });
});

describe("contrastOf", () => {
  it("is symmetric and bounded", () => {
    const white = "oklch(1 0 0)";
    const black = "oklch(0 0 0)";
    expect(contrastOf(white, black)).toBeCloseTo(21, 1);
    expect(contrastOf(black, white)).toBeCloseTo(21, 1);
    expect(contrastOf(white, white)).toBeCloseTo(1, 5);
  });

  it("composites a translucent foreground before measuring", () => {
    const opaque = contrastOf("oklch(0 0 0)", "oklch(1 0 0)")!;
    const faded = contrastOf("oklch(0 0 0 / 50%)", "oklch(1 0 0)")!;
    expect(faded).toBeLessThan(opaque);
    expect(faded).toBeGreaterThan(1);
  });

  it("reports the failure that started batch 11", () => {
    // text-slate-700 on --surface in dark. Measured at 1.15:1 — body copy that
    // is, for practical purposes, invisible.
    const ratio = contrastOf("oklch(0.372 0.044 257.287)", "oklch(0.34 0.035 290)")!;
    expect(ratio).toBeLessThan(AA_CONTRAST);
    expect(ratio).toBeLessThan(1.5);
  });
});
