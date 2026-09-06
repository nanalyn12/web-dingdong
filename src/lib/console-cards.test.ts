import { describe, it, expect } from "vitest";

import { consoleCardsFor } from "./console-cards";
import { navItemsFor } from "./nav-items";

/*
 * Batch ⑬ — the console's card grid.
 *
 * nav-items.ts opens with the rule this file enforces one layer up: "두 표면이
 * 같은 메뉴를 각자 나열하면 조용히 갈라진다". The sidebar, the mobile sheet and
 * the tab bar already read the menu instead of listing it again; the console
 * grid is the fourth consumer and must do the same. A card that writes
 * `url: "/studio"` as its own string literal keeps working right up until the
 * route is renamed, and then it 404s while the sidebar still works.
 *
 * So these tests assert *derivation*, not just values: every card url has to be
 * findable in `navItemsFor(role)`, and the icon has to be the very same object
 * reference the menu holds — not merely an icon that happens to look the same.
 *
 * Q-1 확정 (2026-09-06): `/admin` is a card for teachers too. `nav-items.ts`
 * already decided that screen has two audiences and two names — "관리자" for an
 * admin, "데이터 관리" for a teacher, who only backs up and restores their own
 * content there. The card inherits that rule rather than inventing a second
 * one. Only the *number* on it (승인 대기 교사) is admin-only, and that is the
 * server's job, not this module's — see console-summary.test.ts.
 */

const urls = (role: string | null | undefined) => consoleCardsFor(role).map((c) => c.url);

const CORE_URLS = ["/students", "/curriculum", "/studio", "/songs", "/integrations"];

describe("누가 어떤 카드를 받는가", () => {
  it("교수자는 다섯 개의 작업 카드를 표시 순서대로 받는다", () => {
    expect(urls("teacher").filter((u) => CORE_URLS.includes(u))).toEqual(CORE_URLS);
  });

  it("관리자 카드 목록에 /admin 이 있다", () => {
    expect(urls("admin")).toContain("/admin");
  });

  // Q-1 확정으로 방향이 뒤집힌 항목. 교수자에게도 /admin 카드를 준다.
  it("교수자 카드 목록에도 /admin 이 있다", () => {
    expect(urls("teacher")).toContain("/admin");
  });

  // The one place the two editor roles differ, and it is a label, not a
  // permission. Same expectation nav-items.test.ts already pins on the menu.
  it("/admin 카드의 제목은 읽는 사람에 따라 바뀐다", () => {
    const titleFor = (role: string) => consoleCardsFor(role).find((c) => c.url === "/admin")?.title;
    expect(titleFor("admin")).toBe("관리자");
    expect(titleFor("teacher")).toBe("데이터 관리");
  });

  // The console is opened by a whitelist. Anything that is not an editor role —
  // including a role string this app has never heard of — gets nothing, and the
  // home route falls through to the learner landing.
  it.each(["student", null, undefined, "", "moderator"])("%s 에게는 카드가 없다", (role) => {
    expect(consoleCardsFor(role)).toEqual([]);
  });
});

describe("메뉴에서 파생됐는가", () => {
  // 문자열 재기입 금지. If someone renames /studio in nav-items.ts and the card
  // keeps its own copy of the old path, this is what fails.
  it.each(["teacher", "admin"])("%s 의 모든 카드 url 이 메뉴에 존재한다", (role) => {
    const menu = navItemsFor(role).map((i) => i.url);
    for (const url of urls(role)) expect(menu).toContain(url);
  });

  // Reference equality, not shape equality: importing `Clapperboard` a second
  // time in console-cards.ts would pass a `toBe`-less check while re-listing
  // exactly what the menu already states.
  it.each(["teacher", "admin"])("%s 의 카드 아이콘이 메뉴 항목과 동일 참조다", (role) => {
    const menu = new Map(navItemsFor(role).map((i) => [i.url, i.icon]));
    for (const card of consoleCardsFor(role)) expect(card.icon).toBe(menu.get(card.url));
  });
});

describe("카드 자체의 모양", () => {
  it.each(["teacher", "admin"])("%s 의 모든 카드에 제목이 있다", (role) => {
    for (const card of consoleCardsFor(role)) {
      expect(card.title.trim().length).toBeGreaterThan(0);
    }
  });

  // The one title the card does NOT inherit. The menu calls /songs "학습송"
  // because a learner goes there to listen; the console calls it "학습송 생성"
  // because a teacher goes there to make one. Pinned so the difference reads as
  // deliberate rather than as drift someone should "fix".
  it("학습송 카드의 제목은 메뉴의 학습송과 다르다", () => {
    expect(consoleCardsFor("teacher").find((c) => c.url === "/songs")?.title).toBe("학습송 생성");
  });

  it.each(["teacher", "admin"])("%s 의 카드 id 가 중복되지 않는다", (role) => {
    const ids = consoleCardsFor(role).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("숫자 슬롯 (D-1 — 재고가 아니라 대기 큐)", () => {
  // 커리큘럼에는 실패도 대기도 없다. "내가 만든 커리큘럼 42개"는 손대도 줄지
  // 않는 재고 숫자이고, 재고를 뱃지로 그리면 매일 아침 처리할 수 없는 알림이
  // 하나 늘어난다. 비어 있는 것이 정답이다.
  it("커리큘럼 카드는 숫자 슬롯을 갖지 않는다", () => {
    const card = consoleCardsFor("teacher").find((c) => c.url === "/curriculum");
    expect(card?.metric ?? null).toBeNull();
  });

  // ...but only that one. Without this, a build where *no* card has a metric
  // would satisfy the test above while shipping a console with no numbers.
  it.each(["/students", "/studio", "/songs", "/integrations"])(
    "%s 카드는 숫자 슬롯을 갖는다",
    (url) => {
      const card = consoleCardsFor("teacher").find((c) => c.url === url);
      expect(card?.metric ?? null).not.toBeNull();
    },
  );
});
