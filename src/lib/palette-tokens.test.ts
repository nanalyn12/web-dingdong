import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { AA_CONTRAST, contrastOf } from "./color-contrast";

/*
 * Batch 11 — the hardcoded palette.
 *
 * Batch 9 moved the whites onto `--surface`. What it left behind was every
 * other Tailwind palette class: 313 of them, none carrying a `dark:` variant.
 * A `text-slate-700` is not a token, so `.dark` cannot repaint it — measured on
 * `--surface` in dark it comes to 1.15:1, which is body copy you cannot read.
 *
 * Colour here is doing three unrelated jobs, and that is why this is not a
 * find-and-replace:
 *
 *   neutral text   → --foreground / --muted-foreground
 *   status         → --success / --warning / --danger
 *   difficulty     → --level-beginner / -intermediate / -advanced
 *
 * Sending a difficulty colour to a status token would say that 초급 means
 * success and 중급 means danger.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CSS = readFileSync(join(SRC, "styles.css"), "utf8");

function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`styles.css에 ${selector} 블록이 없다`);
  return CSS.slice(start, CSS.indexOf("\n}", start));
}

/** `--foo: <value>;` pairs declared inside one top-level block. */
function tokens(selector: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block(selector).matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

const NEW_TOKENS = [
  "--success",
  "--warning",
  "--danger",
  "--level-beginner",
  "--level-intermediate",
  "--level-advanced",
];

describe("semantic colour tokens", () => {
  // L1-1 — three places, every time. `:root` and `.dark` give the value;
  // `@theme inline` is what makes `text-success` exist as a utility at all.
  // theme.test.ts watches the first two, so only the third is asserted here.
  it("declares every new token in :root, .dark and @theme inline", () => {
    const light = tokens(":root");
    const dark = tokens(".dark");
    const themeBlock = block("@theme inline");
    const missing: string[] = [];
    for (const token of NEW_TOKENS) {
      if (!light.has(token)) missing.push(`:root ${token}`);
      if (!dark.has(token)) missing.push(`.dark ${token}`);
      if (!themeBlock.includes(`var(${token})`)) missing.push(`@theme inline ${token}`);
    }
    expect(missing).toEqual([]);
  });

  // L1-2 — the whole point of the batch. Every text token has to clear AA
  // against the surfaces it is actually painted on, in both themes.
  it("clears AA on every surface it is used over", () => {
    const TEXT = ["--foreground", "--muted-foreground", "--success", "--warning", "--danger"];
    const failures: string[] = [];
    for (const [theme, selector, grounds] of [
      // The app gradient's darkest stop, then the raised surface.
      ["light", ":root", ["oklch(0.93 0.07 295)", "oklch(1 0 0)"]],
      ["dark", ".dark", ["oklch(0.24 0.05 230)", "oklch(0.34 0.035 290)"]],
    ] as const) {
      const declared = tokens(selector);
      const base = tokens(":root");
      for (const name of TEXT) {
        const value = declared.get(name) ?? base.get(name);
        if (!value) {
          failures.push(`${theme} ${name} 미정의`);
          continue;
        }
        for (const ground of grounds) {
          const ratio = contrastOf(value, ground);
          if (ratio === null) {
            failures.push(`${theme} ${name} 파싱 불가: ${value}`);
          } else if (ratio < AA_CONTRAST) {
            failures.push(`${theme} ${name} on ${ground} = ${ratio.toFixed(2)}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  // L1-3 — difficulty badges were first held to the large-text floor, on the
  // grounds that they are short labels on a tinted pill. Measured on the real
  // page they came to 3.83–4.19 in light, which is thin for text this small,
  // and three token values were all it took to clear the full body-text floor.
  // Raised deliberately; a criterion may tighten, never slacken.
  it("keeps the difficulty tones legible in both themes", () => {
    const LEVELS = ["--level-beginner", "--level-intermediate", "--level-advanced"];
    const failures: string[] = [];
    for (const [theme, selector, ground] of [
      ["light", ":root", "oklch(0.93 0.07 295)"],
      ["dark", ".dark", "oklch(0.34 0.035 290)"],
    ] as const) {
      const declared = tokens(selector);
      for (const name of LEVELS) {
        const value = declared.get(name);
        const ratio = value ? contrastOf(value, ground) : null;
        if (ratio === null) failures.push(`${theme} ${name} 미정의 또는 파싱 불가`);
        else if (ratio < AA_CONTRAST) {
          failures.push(`${theme} ${name} = ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  // L1-4 — the three tones must be distinguishable from each other, or the
  // badge stops encoding anything.
  it("keeps the three difficulty tones distinct from one another", () => {
    for (const selector of [":root", ".dark"]) {
      const t = tokens(selector);
      const values = [
        t.get("--level-beginner"),
        t.get("--level-intermediate"),
        t.get("--level-advanced"),
      ];
      expect(new Set(values).size, `${selector} 등급 색이 겹친다`).toBe(3);
    }
  });
});

/* ── 소스 가드 ─────────────────────────────────────────────────────────── */

function tsxFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function locate(file: string, source: string, index: number): string {
  return `${file.slice(REPO.length).split(sep).join("/")}:${source.slice(0, index).split("\n").length}`;
}

const FAMILIES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
/**
 * Text only, deliberately.
 *
 * The full sweep finds 645 palette classes; 278 of them colour text and are
 * the readability failure this batch exists for. The other 367 are backgrounds,
 * borders and gradient stops — 78 are alpha tints that already read correctly
 * over either theme, and the remaining 289 need tinted *surface* tokens that
 * do not exist yet. Widening this list is the next batch's job, and the
 * failure list it prints is the work order for it.
 */
const PROPS = "text";

/**
 * A numeric shade is what separates Tailwind's palette from this app's own
 * tokens: `bg-pink` is `--pink` and belongs here, `bg-pink-100` does not.
 */
export const PALETTE_CLASS = new RegExp(String.raw`\b(?:${PROPS})-(?:${FAMILIES})-\d{2,3}\b`, "g");

describe("hardcoded palette classes", () => {
  it("has none left in the tsx sources", () => {
    const offenders: string[] = [];
    for (const path of tsxFiles()) {
      const source = readFileSync(path, "utf8");
      for (const m of source.matchAll(PALETTE_CLASS)) {
        offenders.push(`${locate(path, source, m.index)} → ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // Tokenising the text while leaving the tint behind is worse than leaving
  // both alone. `--success` is dark in light and *light* in dark, so on a
  // hardcoded `bg-emerald-100` — which stays light in both themes — the dark
  // theme puts light green on pale green: measured 1.48:1, against the 4.55:1
  // the old `text-emerald-700` had. Backgrounds are otherwise out of scope, so
  // this narrow rule covers exactly the pairing this batch could break.
  it("never pairs a semantic text token with a hardcoded tint background", () => {
    const SEMANTIC = /\btext-(?:success|warning|danger|level-[a-z]+|primary|muted-foreground)\b/;
    const TINT = new RegExp(String.raw`\b(?:bg|border)-(?:${FAMILIES})-\d{2,3}\b`, "g");
    const offenders: string[] = [];
    for (const path of tsxFiles()) {
      // Line by line: a class list is written on one line, and scanning for
      // quoted spans across a whole file backtracks badly on the larger routes.
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!SEMANTIC.test(line)) return;
          const tints = line.match(TINT);
          if (tints) {
            const rel = path.slice(REPO.length).split(sep).join("/");
            offenders.push(`${rel}:${i + 1} → ${tints.join(" ")}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  // A guard whose regex matches nothing passes forever.
  it("catches the shapes it was written for, and spares the app's own tokens", () => {
    expect("text-slate-500 hover:text-rose-600 md:text-emerald-700".match(PALETTE_CLASS)).toEqual([
      "text-slate-500",
      "text-rose-600",
      "text-emerald-700",
    ]);
    // The app's own tokens carry no numeric shade; the other properties are
    // out of scope this batch, and text-white sits on gradients that do not
    // change between themes.
    expect(
      "bg-pink text-surface text-white text-foreground bg-emerald-500/15 border-rose-200".match(
        PALETTE_CLASS,
      ),
    ).toBeNull();
  });
});
