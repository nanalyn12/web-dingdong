import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/*
 * The song screens once promised an MP4 "automatically" after the audio. That
 * stopped being true when advanceSongAudio made MP4 opt-in, but the copy stayed
 * and kept telling editors to wait for a video that never came.
 *
 * The first test pins the fact the copy depends on; the rest fail on the next
 * string that promises otherwise.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

function songRouteFiles(): string[] {
  return readdirSync(join(SRC, "routes"))
    .filter((n) => n.startsWith("_app.songs") && n.endsWith(".tsx"))
    .map((n) => join("routes", n));
}

/** Source of `export async function advanceSongAudio` up to the next top-level export. */
function advanceSongAudioBody(): string {
  const src = read("lib/songs.functions.ts");
  const start = src.indexOf("export async function advanceSongAudio");
  expect(start).toBeGreaterThanOrEqual(0);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("song MP4 copy matches the audio pipeline", () => {
  it("advanceSongAudio does not start an MP4 task", () => {
    // Its own comment names generateSongMp4 to say where MP4 starts instead.
    const body = advanceSongAudioBody()
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    expect(body).not.toMatch(/sunoCreateMp4|generateSongMp4/);
  });

  it("no song screen promises an automatic MP4", () => {
    const offenders: string[] = [];
    for (const rel of songRouteFiles()) {
      read(rel)
        .split("\n")
        .forEach((line, i) => {
          if (/자동으로[^"'`\n]*MP4|MP4\s*영상까지|auto-kickoff/i.test(line)) {
            offenders.push(`src/${rel.replace(/\\/g, "/")}:${i + 1}  ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it("the start toast and the generating panel describe what does happen", () => {
    const index = read("routes/_app.songs.index.tsx");
    const detail = read("routes/_app.songs.$id.tsx");
    for (const src of [index, detail]) {
      expect(src).toMatch(/음원[^"\n]*완료되면[^"\n]*가사 싱크[^"\n]*학습 자료/);
    }
  });
});
