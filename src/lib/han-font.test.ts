import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/*
 * A line of Chinese on screen came out in two faces — in "比赛就要开始了" the
 * 赛 and 开 were thinner than their neighbours. The app sets no font of its own,
 * so on Korean Windows the Han characters are looked up in Malgun Gothic
 * first: it has the Korean (traditional-form) hanja, so 比·就·要 come from it,
 * and the simplified-only 赛·开 fall through to another face.
 *
 * A face that covers only Han, placed first in the stack, sends every Han
 * character to one Simplified Chinese font and leaves Hangul and Latin
 * (pinyin included) exactly where they were. These tests read styles.css.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(join(SRC, "styles.css"), "utf8");

const FAMILY = '"DD Han"';

/** Every @font-face block for the Han alias. */
function hanFaces(): string[] {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)]
    .map((m) => m[1])
    .filter((body) => body.includes(`font-family: ${FAMILY}`));
}

/** unicode-range of a face as [start, end] code point pairs. */
function ranges(face: string): [number, number][] {
  const m = /unicode-range:\s*([^;]+);/.exec(face);
  if (!m) return [];
  return m[1].split(",").map((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, "").split("-");
    const start = parseInt(a, 16);
    return [start, b ? parseInt(b, 16) : start];
  });
}

const covers = (rs: [number, number][], lo: number, hi: number) =>
  rs.some(([a, b]) => a <= lo && hi <= b);
const touches = (rs: [number, number][], lo: number, hi: number) =>
  rs.some(([a, b]) => a <= hi && lo <= b);

describe("the Han-only font alias", () => {
  // H-1
  it("exists and covers the CJK ideograph blocks", () => {
    const faces = hanFaces();
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) {
      const rs = ranges(f);
      expect(covers(rs, 0x4e00, 0x9fff)).toBe(true);
      expect(covers(rs, 0x3400, 0x4dbf)).toBe(true);
    }
  });

  // H-2
  it("leaves Hangul and Latin — pinyin tone marks included — to the existing fonts", () => {
    // Without a face this loop would pass by checking nothing.
    expect(hanFaces().length).toBeGreaterThan(0);
    for (const f of hanFaces()) {
      const rs = ranges(f);
      expect(touches(rs, 0xac00, 0xd7af)).toBe(false); // Hangul syllables
      expect(touches(rs, 0x1100, 0x11ff)).toBe(false); // Hangul jamo
      expect(touches(rs, 0x3130, 0x318f)).toBe(false); // compatibility jamo
      expect(touches(rs, 0x0000, 0x00ff)).toBe(false); // Basic Latin + Latin-1
      expect(touches(rs, 0x0100, 0x024f)).toBe(false); // Latin Extended (ǎ ǐ ǒ ǔ ǚ)
    }
  });

  // H-3
  it("uses fonts already on the device, downloading nothing", () => {
    expect(hanFaces().length).toBeGreaterThan(0);
    for (const f of hanFaces()) {
      expect(f).toMatch(/src:\s*local\(/);
      expect(f).not.toMatch(/url\(/);
    }
  });

  // H-4
  it("names a Simplified Chinese face for each platform", () => {
    const all = hanFaces().join("\n");
    expect(all).toMatch(/local\("PingFang SC/); // Apple
    expect(all).toMatch(/local\("Microsoft YaHei/); // Windows
    expect(all).toMatch(/local\("Noto Sans (CJK )?SC/); // Android, Linux
  });

  // H-5
  it("has a real bold face, so bold Chinese is not faked", () => {
    const weights = hanFaces().map((f) => {
      const m = /font-weight:\s*(\d+)(?:\s+(\d+))?;/.exec(f);
      return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
    });
    expect(weights.every((w) => w !== null)).toBe(true);
    expect(weights.some((w) => w![0] <= 400 && w![1] >= 400)).toBe(true);
    expect(weights.some((w) => w![0] >= 600)).toBe(true);
  });

  // H-6
  it("comes first in the sans stack, ahead of Tailwind's defaults", () => {
    const m = /--font-sans:\s*([^;]+);/.exec(css);
    expect(m).not.toBeNull();
    const stack = m![1].split(",").map((s) => s.trim());
    expect(stack[0]).toBe(FAMILY);
    for (const f of ["ui-sans-serif", "system-ui", "sans-serif"]) expect(stack).toContain(f);
  });
});
