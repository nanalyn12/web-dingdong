import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/*
 * The lesson page showed "🎨 AI 만화 이미지 생성" to everyone whose lesson had
 * no comic images yet — guests and students included. The server refuses them
 * (requireAuth + assertEditor), so a learner who pressed it got an error for a
 * button that was never theirs. The 문화 카드 button on the same page was
 * already behind isEditor; the comic one had been missed.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const lessonPage = () => readFileSync(join(SRC, "routes/_app.lessons.$id.tsx"), "utf8");

describe("AI generation controls on the lesson page are for editors", () => {
  // D-1
  it("hands the comic strip its generate action only when the reader is an editor", () => {
    const src = lessonPage();
    const props = [...src.matchAll(/onGenerate=\{([^\n]*)/g)].map((m) => m[1]);
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) expect(p.trimStart()).toMatch(/^isEditor\s*\?/);
  });

  // D-2
  it("draws the generate button only when it was handed an action", () => {
    const src = lessonPage();
    const start = src.indexOf("function ComicStrip(");
    expect(start).toBeGreaterThanOrEqual(0);
    const body = src.slice(start, src.indexOf("\nfunction ", start + 1));
    expect(body).toMatch(/onGenerate\?:/);
    expect(body).toMatch(/onGenerate\s*&&/);
  });
});
