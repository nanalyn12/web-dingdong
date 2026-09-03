import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/*
 * Batch ③ — the hardcoded whites.
 *
 * `.dark` gave every semantic token a dark value, but a `bg-white/50` written
 * directly into a className is not a token: it stays 50% white on a 0.22
 * background, which is how a glass card turns into a glare panel. 261 of them
 * were spread across 34 files, against 11 `dark:` variants in the whole tree.
 *
 * The fix is one token — `--surface`, white in light and a raised grey in dark
 * — so `bg-surface/50` keeps the light rendering pixel-identical and reads as
 * a lifted card in dark. This guard is what stops the 262nd from being added:
 * a count alone would say something is wrong without saying where, so every
 * offender is reported with file and line.
 *
 * `text-white` and `bg-black` are deliberately NOT covered. White text sits on
 * gradient buttons that are the same colour in both themes, and the black
 * scrims are already dark by intent.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));

function tsxFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** `src/routes/_app.foo.tsx:42` — clickable, so a failure is actionable. */
function locate(file: string, source: string, index: number): string {
  const rel = file.slice(REPO.length).split(sep).join("/");
  return `${rel}:${source.slice(0, index).split("\n").length}`;
}

describe("surface token", () => {
  it("has no hardcoded white background, border, ring or gradient stop", () => {
    const WHITE = /\b(?:bg|border|from|via|to|ring)-white\b/g;
    const offenders: string[] = [];
    for (const path of tsxFiles()) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(WHITE)) {
        offenders.push(`${locate(path, source, match.index)} → ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the light rendering byte-identical by defining --surface as white", () => {
    const css = readFileSync(join(SRC, "styles.css"), "utf8");
    expect(css).toMatch(/^\s*--surface:\s*oklch\(1 0 0\);/m);
  });
});

describe("the guard itself", () => {
  // L1-3-3 — a regex guard that matches nothing passes forever. This proves it
  // still catches the exact shape it was written for.
  it("catches a hardcoded white when one is present", () => {
    const WHITE = /\b(?:bg|border|from|via|to|ring)-white\b/g;
    expect([...`rounded-xl bg-white/60 border-white`.matchAll(WHITE)]).toHaveLength(2);
    expect([...`text-white bg-black/40 bg-surface/60`.matchAll(WHITE)]).toHaveLength(0);
  });
});

describe("styles.css utilities", () => {
  // The five `oklch(1 0 0 / …)` literals inside @utility and the coach-mark
  // rules are the same bug one layer down: a utility cannot be re-themed by
  // the `.dark` block if it never asks a token for its colour.
  it("declares literal whites only inside the token blocks", () => {
    const css = readFileSync(join(SRC, "styles.css"), "utf8");
    const offenders: string[] = [];
    let inTokenBlock = false;
    css.split("\n").forEach((line, i) => {
      if (/^(?::root|\.dark)\s*\{/.test(line)) inTokenBlock = true;
      else if (/^\}/.test(line)) inTokenBlock = false;
      else if (!inTokenBlock && /oklch\(1 0 0/.test(line)) {
        offenders.push(`src/styles.css:${i + 1} → ${line.trim()}`);
      }
    });
    expect(offenders).toEqual([]);
  });
});
