import { describe, it, expect } from "vitest";

import { isNavItemActive, navItemsFor, tabBarItemsFor } from "./nav-items";

const urls = (role: string | null | undefined) => navItemsFor(role).map((i) => i.url);

const VISITOR_URLS = [
  "/",
  "/dashboard",
  "/courses",
  "/dramas",
  "/songs",
  "/vocabulary",
  "/settings",
];

const EDITOR_ONLY_URLS = ["/students", "/curriculum", "/studio", "/integrations", "/admin"];

describe("what a visitor sees", () => {
  // L1-1 — order matters: this is the rendered menu, not a set.
  it("gives a signed-out visitor the learning menu in display order", () => {
    expect(urls(undefined)).toEqual(VISITOR_URLS);
  });

  // L1-2
  it("gives a student the same menu", () => {
    expect(urls("student")).toEqual(VISITOR_URLS);
  });

  // L1-6 — the negative is the one that matters. A leak here puts a link to an
  // editor screen in a student's menu.
  it.each(["student", null, undefined, "", "unknown-role"])(
    "leaks no editor destination to %s",
    (role) => {
      expect(urls(role)).not.toEqual(expect.arrayContaining(EDITOR_ONLY_URLS));
      for (const editorUrl of EDITOR_ONLY_URLS) {
        expect(urls(role)).not.toContain(editorUrl);
      }
    },
  );
});

describe("what an editor sees", () => {
  // L1-3
  it.each(EDITOR_ONLY_URLS)("gives a teacher %s", (url) => {
    expect(urls("teacher")).toContain(url);
  });

  it("keeps the learning menu for a teacher too", () => {
    for (const url of VISITOR_URLS) expect(urls("teacher")).toContain(url);
  });

  // L1-4
  it("gives an admin the same destinations as a teacher", () => {
    expect(urls("admin")).toEqual(urls("teacher"));
  });

  // L1-5 — the one place the two editor roles differ.
  it("names the admin screen for the role reading it", () => {
    const labelFor = (role: string) => navItemsFor(role).find((i) => i.url === "/admin")?.title;
    expect(labelFor("admin")).toBe("관리자");
    expect(labelFor("teacher")).toBe("데이터 관리");
  });
});

describe("menu shape", () => {
  // L1-7
  it.each(["student", "teacher", "admin", undefined])("has sane urls for %s", (role) => {
    const list = urls(role);
    expect(new Set(list).size).toBe(list.length);
    for (const url of list) expect(url.startsWith("/")).toBe(true);
  });

  it.each(["student", "teacher", "admin", undefined])("labels every item for %s", (role) => {
    for (const item of navItemsFor(role)) expect(item.title.trim().length).toBeGreaterThan(0);
  });

  // L1-8 — the coachmark targets these by selector. runTour() silently drops
  // steps whose element is missing, so a renamed id degrades without an error.
  it("keeps the coachmark ids on the six learning destinations", () => {
    const tours = new Map(navItemsFor("student").map((i) => [i.url, i.tour]));
    expect(tours.get("/")).toBe("nav-home");
    expect(tours.get("/dashboard")).toBe("nav-dashboard");
    expect(tours.get("/courses")).toBe("nav-courses");
    expect(tours.get("/dramas")).toBe("nav-dramas");
    expect(tours.get("/songs")).toBe("nav-songs");
    expect(tours.get("/vocabulary")).toBe("nav-vocabulary");
  });
});

describe("which row is highlighted", () => {
  // L1-10 — Home is the trap: a plain prefix match makes it active everywhere.
  it("highlights Home only on the root", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/courses", "/")).toBe(false);
    expect(isNavItemActive("/songs/abc", "/")).toBe(false);
  });

  it("highlights a section from its own page and its children", () => {
    expect(isNavItemActive("/courses", "/courses")).toBe(true);
    expect(isNavItemActive("/courses/some-id", "/courses")).toBe(true);
    // The review screen breaks out of the layout but still lives under the
    // vocabulary path, so the 단어장 row stays lit.
    expect(isNavItemActive("/vocabulary/review", "/vocabulary")).toBe(true);
  });

  it("does not highlight a section whose name merely starts the same way", () => {
    expect(isNavItemActive("/coursework", "/courses")).toBe(false);
    expect(isNavItemActive("/settings-old", "/settings")).toBe(false);
  });
});

const TAB_BAR_URLS = ["/", "/courses", "/dramas", "/songs", "/vocabulary"];
const EVERY_ROLE = ["student", "teacher", "admin", undefined] as const;

describe("the phone tab bar", () => {
  // L1-1
  it("puts the five learning destinations in reach", () => {
    expect(tabBarItemsFor(undefined).map((i) => i.url)).toEqual(TAB_BAR_URLS);
  });

  // L1-2 — a teacher is still a learner here; the authoring screens live in
  // the sheet, not on the bar.
  it.each(EVERY_ROLE)("shows the same five to %s", (role) => {
    expect(tabBarItemsFor(role).map((i) => i.url)).toEqual(TAB_BAR_URLS);
  });

  // L1-3 — the bar is a shortcut into the menu, never a second menu. If a url
  // is renamed in one place this catches the other going stale.
  it.each(EVERY_ROLE)("only shortcuts things %s can already reach", (role) => {
    const menu = navItemsFor(role).map((i) => i.url);
    for (const item of tabBarItemsFor(role)) expect(menu).toContain(item.url);
  });

  it.each(EVERY_ROLE)("keeps the label the menu uses, for %s", (role) => {
    const menu = new Map(navItemsFor(role).map((i) => [i.url, i.title]));
    for (const item of tabBarItemsFor(role)) expect(item.title).toBe(menu.get(item.url));
  });

  // L1-4 — 375 / 5 = 75px a column, the floor for an icon over a label.
  it("stays within what a 375px row can hold", () => {
    expect(tabBarItemsFor(undefined).length).toBeLessThanOrEqual(5);
  });

  // L1-5
  it.each(EVERY_ROLE)("leaves the non-learning screens in the sheet for %s", (role) => {
    const urls = tabBarItemsFor(role).map((i) => i.url);
    for (const url of ["/dashboard", "/settings", ...EDITOR_ONLY_URLS]) {
      expect(urls).not.toContain(url);
    }
  });

  // L1-6
  it("labels every tab short enough to fit its column", () => {
    for (const item of tabBarItemsFor(undefined)) {
      expect(item.title.length).toBeLessThanOrEqual(6);
    }
  });
});
