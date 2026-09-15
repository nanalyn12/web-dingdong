import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { GUIDE_TOUR_PAGE, guidesFor } from "./teacher-guide";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** Every navigable path the router knows, without trailing slashes. */
function routePaths(): Set<string> {
  const gen = readFileSync(join(SRC, "routeTree.gen.ts"), "utf8");
  const block = gen.slice(
    gen.indexOf("export interface FileRoutesByFullPath"),
    gen.indexOf("export interface FileRoutesByTo"),
  );
  const paths = [...block.matchAll(/^\s+'([^']+)':/gm)].map((m) =>
    m[1].length > 1 ? m[1].replace(/\/$/, "") : m[1],
  );
  return new Set(paths);
}

const TITLES = [
  "처음 시작하기",
  "커리큘럼 만들기",
  "강좌·레슨 만들기",
  "교육 영상 만들기",
  "학습송 만들기",
  "학생 현황 보기",
  "내 콘텐츠 백업·복원",
];

describe("who gets the teacher guide", () => {
  // L1-2
  it.each(["teacher", "admin"])("gives %s the seven guides in order", (role) => {
    expect(guidesFor(role).map((g) => g.title)).toEqual(TITLES);
  });

  it.each(["student", undefined, null, ""])("gives %s nothing", (role) => {
    expect(guidesFor(role)).toEqual([]);
  });
});

describe("guide shape", () => {
  const guides = guidesFor("teacher");

  // L1-3
  it("has unique ids", () => {
    const ids = guides.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(TITLES)("fills in every section of %s", (title) => {
    const g = guides.find((x) => x.title === title)!;
    expect(g.summary.trim()).not.toBe("");
    expect(g.steps.length).toBeGreaterThanOrEqual(3);
    for (const s of g.steps) expect(s.trim()).not.toBe("");
    expect(g.duration.trim()).not.toBe("");
    expect(g.cost.trim()).not.toBe("");
    expect(g.pitfalls.length).toBeGreaterThanOrEqual(1);
    for (const p of g.pitfalls) expect(p.trim()).not.toBe("");
  });
});

describe("guides point at real screens", () => {
  const guides = guidesFor("teacher");
  const routes = routePaths();

  it("reads the route tree", () => {
    expect(routes.has("/courses")).toBe(true);
    expect(routes.has("/students")).toBe(true);
  });

  // L1-4
  it.each(TITLES)("opens only existing routes from %s", (title) => {
    const g = guides.find((x) => x.title === title)!;
    const urls = [g.url, ...(g.links ?? []).map((l) => l.url)];
    for (const url of urls) expect(routes, `${title} → ${url}`).toContain(url);
  });

  // L1-5
  it.each(TITLES)("offers a tour from %s only where one runs", (title) => {
    const g = guides.find((x) => x.title === title)!;
    const tourPages = Object.values(GUIDE_TOUR_PAGE);
    if (g.tour) {
      expect(g.url).toBe(GUIDE_TOUR_PAGE[g.tour]);
    } else {
      expect(tourPages).not.toContain(g.url);
    }
  });

  it("maps tours to the screens app-shell runs them on", () => {
    expect(GUIDE_TOUR_PAGE).toEqual({ console: "/", courses: "/courses" });
  });
});

describe("guide wording follows the screens", () => {
  const guides = guidesFor("teacher");

  // L1-6 — 「label」 must exist verbatim in one of the guide's source files.
  it.each(TITLES)("quotes only on-screen labels in %s", (title) => {
    const g = guides.find((x) => x.title === title)!;
    expect(g.sources.length).toBeGreaterThan(0);
    const texts = g.sources.map((rel) => readFileSync(join(SRC, rel), "utf8"));
    const quoted = [...g.steps, ...g.pitfalls].flatMap((line) =>
      [...line.matchAll(/「([^」]+)」/g)].map((m) => m[1]),
    );
    expect(quoted.length, `${title}: 화면 문구를 하나도 인용하지 않음`).toBeGreaterThan(0);
    const missing = quoted.filter((label) => !texts.some((t) => t.includes(label)));
    expect(missing, `${title}: ${g.sources.join(", ")}에 없는 문구`).toEqual([]);
  });
});
