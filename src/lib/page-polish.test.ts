import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { tagChineseRuns } from "./pdf-report";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

function allSourceFiles(dir: string): string[] {
  return readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? allSourceFiles(join(dir, e.name))
      : /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".test.ts")
        ? [join(dir, e.name)]
        : [],
  );
}

describe("the video studio form numbers its steps without gaps", () => {
  // G-1: the labels ran ①②③④⑥⑦⑧ — ⑤ was never there.
  it("counts ①, ②, ③ … in the order they appear", () => {
    const src = read("routes/_app.studio.tsx");
    const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
    const seen = [...src].filter((ch) => CIRCLED.includes(ch)).map((ch) => CIRCLED.indexOf(ch) + 1);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).toEqual(seen.map((_, i) => i + 1));
  });
});

describe("every page names itself", () => {
  // G-2a: 학습송·영상 상세 had no head, so the tab read the root default.
  it("each app route declares a title", () => {
    const routes = readdirSync(join(SRC, "routes")).filter(
      // _app.tsx is the layout around every page, not a page of its own.
      (n) => n.startsWith("_app.") && n.endsWith(".tsx") && n !== "_app.tsx",
    );
    expect(routes.length).toBeGreaterThan(10);
    const missing = routes.filter(
      (n) => !/head:\s*\([^)]*\)\s*=>[\s\S]{0,400}?\btitle:/.test(read(join("routes", n))),
    );
    expect(missing).toEqual([]);
  });

  // G-2b: it was also og:title / twitter:title, so every shared link read it.
  it("the placeholder name 'dingdong lms' is gone", () => {
    const hits = allSourceFiles(".").filter((f) => read(f).includes("dingdong lms"));
    expect(hits).toEqual([]);
  });
});

describe("Chinese in a generated PDF is marked as Chinese", () => {
  const SPAN = /<span lang="zh-CN"[^>]*>/g;

  // G-3a
  it("wraps a Chinese sentence, punctuation included, as one run", () => {
    const out = tagChineseRuns("请问，这趟车到上海虹桥站吗？");
    expect(out.match(SPAN)).toHaveLength(1);
    expect(out.replace(SPAN, "").replace("</span>", "")).toBe("请问，这趟车到上海虹桥站吗？");
  });

  // G-3b
  it("leaves Korean alone", () => {
    const ko = "실례합니다, 이 열차가 상하이 훙차오역에 가나요?";
    expect(tagChineseRuns(ko)).toBe(ko);
  });

  // G-3c
  it("wraps only the Chinese inside a mixed sentence", () => {
    const out = tagChineseRuns("지수는 '新媒体'라는 단어를 봤어요.");
    expect(out.match(SPAN)).toHaveLength(1);
    expect(out).toMatch(/^지수는 '<span lang="zh-CN"[^>]*>新媒体<\/span>'라는 단어를 봤어요\.$/);
  });

  // G-3d
  it("does not touch markup, attribute values included", () => {
    const out = tagChineseRuns('<td title="中文" style="padding:8px">中文</td>');
    expect(out.startsWith('<td title="中文" style="padding:8px">')).toBe(true);
    expect(out.match(SPAN)).toHaveLength(1);
    expect(out.endsWith("</span></td>")).toBe(true);
  });

  // G-3e
  it("is safe to apply twice", () => {
    const once = tagChineseRuns("<p>你好 안녕</p>");
    expect(tagChineseRuns(once)).toBe(once);
  });

  // G-3f
  it("both PDF builders run their HTML through it", () => {
    expect(read("components/lesson-pdf-button.tsx")).toMatch(/tagChineseRuns\(/);
    expect(read("components/curriculum-pdf-button.tsx")).toMatch(/tagChineseRuns\(/);
  });
});
