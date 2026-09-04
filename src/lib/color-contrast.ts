/**
 * OKLCH → sRGB → WCAG contrast, in pure arithmetic.
 *
 * The design system states every colour in oklch, and the gate needs to judge
 * whether a token pair is readable. Batches 8 and 10 measured this in a
 * browser by handing the string to a canvas and reading the pixel back, which
 * works but cannot run here: vitest is configured `environment: "node"`, where
 * there is no canvas. So the conversion is written out.
 *
 * Only what the tokens actually use is supported — `oklch(L C H)` and
 * `oklch(L C H / A)`, with L as a number or a percentage.
 */

export type Rgb = [number, number, number];

/** WCAG AA for body text. */
export const AA_CONTRAST = 4.5;
/** WCAG AA for large text, and the floor for decorative marks. */
export const AA_LARGE_CONTRAST = 3;
/** WCAG AAA for body text. */
export const AAA_CONTRAST = 7;

const OKLCH = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i;

export type Oklch = { l: number; c: number; h: number; alpha: number };

/** Returns null rather than throwing — a malformed token is a test failure
 *  with a readable message, not a stack trace from inside the parser. */
export function parseOklch(value: string): Oklch | null {
  const m = OKLCH.exec(value.trim());
  if (!m) return null;
  const pct = (raw: string) => (raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw));
  return { l: pct(m[1]), c: Number(m[2]), h: Number(m[3]), alpha: m[4] ? pct(m[4]) : 1 };
}

function gamma(u: number): number {
  const v = u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v)) * 255;
}

/** oklch → sRGB (0–255), clipped to gamut the way a browser does. */
export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  return [
    gamma(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    gamma(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    gamma(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  ];
}

/** Flattens a translucent colour onto an opaque backdrop. */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as Rgb;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const lin = [r, g, b].map((v) => {
    const u = v / 255;
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Contrast between two oklch strings, compositing a translucent foreground. */
export function contrastOf(foreground: string, background: string): number | null {
  const fg = parseOklch(foreground);
  const bg = parseOklch(background);
  if (!fg || !bg) return null;
  const bgRgb = oklchToRgb(bg);
  const fgRgb = oklchToRgb(fg);
  return contrastRatio(fg.alpha < 1 ? over(fgRgb, fg.alpha, bgRgb) : fgRgb, bgRgb);
}
