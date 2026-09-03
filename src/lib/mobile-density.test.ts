import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { MIN_TAP_TARGET_PX } from "./mobile-ui";

/*
 * Guards for the two density rules that live as className literals across the
 * routes rather than in one module.
 *
 * A `<Card>` component would let these be stated once and typechecked, but
 * introducing one means touching every screen at once. Until then the rule is
 * written here: the gate fails on the next `<Button className="h-8">` someone
 * adds, which is the part that actually decays.
 *
 * Both guards report file, line and the offending className — a count alone
 * says something is wrong without saying where.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));

function tsxFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["routes", "components", join("components", "ui")]) {
    const full = join(SRC, dir);
    for (const name of readdirSync(full, { withFileTypes: true })) {
      if (name.isFile() && name.name.endsWith(".tsx")) out.push(join(full, name.name));
    }
  }
  return out;
}

const REPO = fileURLToPath(new URL("../..", import.meta.url));

/** `src/routes/_app.foo.tsx:42` — clickable, so a failure is actionable. */
function locate(file: string, source: string, index: number): string {
  const rel = file.slice(REPO.length).replace(/\\/g, "/");
  return `${rel}:${source.slice(0, index).split("\n").length}`;
}

/** Class tokens that apply unconditionally — no `sm:`, `md:`, `hover:`, … */
function unprefixed(className: string): string[] {
  return className.split(/\s+/).filter((t) => t && !t.includes(":"));
}

const FILES = tsxFiles().map((path) => ({ path, source: readFileSync(path, "utf8") }));

describe("card padding on a phone", () => {
  // L1-1 — main already contributes p-4, so a card adding p-6 on top of it
  // spends 80px of a 375px screen on gutters.
  it("steps card padding down for phones", () => {
    // Any string or template literal, not just a className= attribute: the
    // card classes are just as often assembled inside cn(…) or an array join.
    const LITERAL = /"([^"\n]*)"|`([^`]*)`/gs;
    const offenders: string[] = [];

    for (const { path, source } of FILES) {
      for (const match of source.matchAll(LITERAL)) {
        const className = match[1] ?? match[2] ?? "";
        if (!className.includes("rounded-3xl")) continue;
        const heavy = unprefixed(className).filter((t) => /^p-[678]$/.test(t));
        if (heavy.length > 0) {
          offenders.push(`${locate(path, source, match.index)} → ${heavy.join(" ")}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("viewport-relative heights", () => {
  // A caller pinning max-h-[85vh] silently overrode the dvh bound that
  // DIALOG_CONTENT_CLASS sets, which is how the dialogs "fixed" in batch 1
  // stayed clipped behind the URL bar.
  it("measures against the dynamic viewport, not the largest one", () => {
    const LITERAL = /"([^"\n]*)"|`([^`]*)`/gs;
    const offenders: string[] = [];

    for (const { path, source } of FILES) {
      for (const match of source.matchAll(LITERAL)) {
        const className = match[1] ?? match[2] ?? "";
        for (const token of className.split(/\s+/)) {
          if (/-\[\d+(?:\.\d+)?vh\]/.test(token)) {
            offenders.push(`${locate(path, source, match.index)} → ${token}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("tap targets at the call site", () => {
  // L1-2 — the primitives were raised to 44px in batch 1, but tailwind-merge
  // lets a caller's own h-* win. A pin below the floor silently opts that one
  // control back out.
  it("never pins a control below the tap-target floor", () => {
    const CONTROL =
      /<(Button|SelectTrigger|Input|SpeakButton)\b[^>]*?className=(?:"([^"]*)"|\{`([^`]*)`\})/gs;
    const offenders: string[] = [];

    for (const { path, source } of FILES) {
      for (const match of source.matchAll(CONTROL)) {
        const className = match[2] ?? match[3] ?? "";
        for (const token of unprefixed(className)) {
          // `size-*` sets height as well as width, and tailwind-merge lets it
          // beat the primitive's own h-*/w-* exactly like a bare `h-*` does.
          // `min-h-*` is here because the SpeakButton and tab recipes state the
          // floor that way; anchoring on `h|size` alone read straight past them.
          const height = token.match(/^(?:min-h|h|size)-(\d+)$/);
          if (!height) continue;
          const px = Number(height[1]) * 4;
          if (px < MIN_TAP_TARGET_PX) {
            offenders.push(`${locate(path, source, match.index)} <${match[1]}> ${token} = ${px}px`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
