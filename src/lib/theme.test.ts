import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import {
  DARK_CLASS,
  THEME_BOOT_SCRIPT,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
} from "./theme";

/*
 * Batch ② — dark mode.
 *
 * The `.dark` token block and the `@custom-variant dark` hook have been in
 * styles.css all along; nothing ever put the class on <html>. The pieces that
 * can be judged without a browser are collected here: the three-way preference
 * and its fallback, the completeness of the `.dark` token set, and the fact
 * that the pre-hydration boot script and the module agree on the storage key
 * and the class name — a pair that silently breaks if only one side is edited.
 */

describe("theme preference", () => {
  // L1-2-1
  it("is a three-way choice", () => {
    expect([...THEME_PREFERENCES]).toEqual(["light", "dark", "system"]);
  });

  it("resolves an explicit choice regardless of the OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the OS when the choice is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  // L1-2-2 — every existing profile row arrives here as NULL.
  it("falls back to system for anything unrecognised", () => {
    for (const raw of [null, undefined, "", "DARK", "어두움", {}, 0, [], "System "]) {
      expect(parseThemePreference(raw)).toBe("system");
    }
  });

  it("passes the three valid values through", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });
});

/* ── 소스 가드 ─────────────────────────────────────────────────────────── */

const CSS = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

/** Top-level blocks close with a `}` in the first column. */
function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`styles.css에 ${selector} 블록이 없다`);
  const end = CSS.indexOf("\n}", start);
  return CSS.slice(start, end);
}

function customProps(source: string): string[] {
  return [...source.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]);
}

describe("dark token completeness", () => {
  // L1-2-3 — the block was written by hand and drifted: the gradients, the
  // shadows and the pastel palette were all light-only, so switching the class
  // on would have left the page's own background pastel under white text.
  //
  // `--radius` is geometry, not colour; it is the only :root token that does
  // not belong to a theme.
  const GEOMETRY = new Set(["--radius"]);

  it("defines every theme token from :root in .dark too", () => {
    const light = customProps(block(":root")).filter((t) => !GEOMETRY.has(t));
    const dark = new Set(customProps(block(".dark")));
    expect(light.filter((t) => !dark.has(t))).toEqual([]);
  });

  it("does not define tokens in .dark that :root never declares", () => {
    const light = new Set(customProps(block(":root")));
    expect(customProps(block(".dark")).filter((t) => !light.has(t))).toEqual([]);
  });
});

describe("pre-hydration boot script", () => {
  // L1-2-4 — the script runs before React and cannot import anything, so the
  // key and the class name are string literals inside it. If either is renamed
  // on one side only, the theme silently stops being applied on first paint;
  // nothing else in the gate would notice.
  it("uses the same storage key the module exports", () => {
    expect(THEME_BOOT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it("toggles the class the dark variant is keyed on", () => {
    expect(DARK_CLASS).toBe("dark");
    expect(THEME_BOOT_SCRIPT).toContain(JSON.stringify(DARK_CLASS));
    expect(CSS).toContain(`@custom-variant dark (&:is(.${DARK_CLASS} *))`);
  });

  it("reads the OS preference, so a stored 'system' resolves on first paint", () => {
    expect(THEME_BOOT_SCRIPT).toContain("prefers-color-scheme: dark");
  });

  it("cannot throw — a blocked localStorage must not take the page down", () => {
    expect(THEME_BOOT_SCRIPT).toContain("catch");
  });
});
