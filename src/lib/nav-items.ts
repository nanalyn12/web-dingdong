import {
  BookOpen,
  CalendarClock,
  Clapperboard,
  Film,
  GraduationCap,
  Home,
  KeyRound,
  LayoutDashboard,
  Music,
  Plug,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { isEditorRole } from "./roles";

/**
 * The navigation list, derived once and shared by the desktop sidebar and the
 * mobile sheet.
 *
 * The permission branching used to live inline in app-sidebar.tsx as four
 * separate `isEditor && <Link>` blocks plus an `isAdmin ? …` label. With two
 * surfaces rendering the same menu that arrangement drifts the moment someone
 * adds an item to one of them, and the drift is silent. Same reason roles.ts
 * exists: one rule, one place.
 *
 * Showing a link is a convenience, not a security boundary — the server still
 * decides what it will serve.
 */
export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Coachmark target. The tour filters out steps whose element is missing, so
   *  a renamed id breaks the tour silently rather than loudly. */
  tour?: string;
};

/** Items every visitor sees, in display order. */
const BASE_ITEMS: NavItem[] = [
  { title: "홈", url: "/", icon: Home, tour: "nav-home" },
  { title: "대시보드", url: "/dashboard", icon: LayoutDashboard, tour: "nav-dashboard" },
  { title: "강의", url: "/courses", icon: GraduationCap, tour: "nav-courses" },
  { title: "영상 학습", url: "/dramas", icon: Film, tour: "nav-dramas" },
  { title: "학습송", url: "/songs", icon: Music, tour: "nav-songs" },
  { title: "단어장", url: "/vocabulary", icon: BookOpen, tour: "nav-vocabulary" },
];

/** Authoring and oversight screens, shown to teachers and admins. */
const EDITOR_ITEMS: NavItem[] = [
  { title: "학생 현황", url: "/students", icon: Users },
  { title: "커리큘럼 생성기", url: "/curriculum", icon: CalendarClock },
  { title: "영상 스튜디오", url: "/studio", icon: Clapperboard },
  { title: "연동 상태", url: "/integrations", icon: Plug },
];

const SETTINGS_ITEM: NavItem = { title: "AI 설정", url: "/settings", icon: KeyRound };

/**
 * `/admin` is one screen with two audiences: an admin also approves teachers
 * there, a teacher only backs up and restores their own content. The label
 * follows whoever is reading it.
 */
function adminItem(role: string | null | undefined): NavItem {
  return {
    title: role === "admin" ? "관리자" : "데이터 관리",
    url: "/admin",
    icon: ShieldCheck,
  };
}

/** The menu for `role`, in display order. */
export function navItemsFor(role: string | null | undefined): NavItem[] {
  if (!isEditorRole(role)) return [...BASE_ITEMS, SETTINGS_ITEM];
  return [...BASE_ITEMS, ...EDITOR_ITEMS, SETTINGS_ITEM, adminItem(role)];
}

/**
 * The destinations the phone tab bar puts one tap away.
 *
 * Derived from the menu rather than listed again: the bar is a shortcut into
 * `navItemsFor`, never a second menu, so a renamed url or label cannot leave
 * the two disagreeing.
 *
 * `/dashboard` and `/settings` are deliberately absent — a status screen and a
 * preferences screen are not where a learner goes to study — and so are the
 * teacher screens, which are not part of the learning path. All of them stay
 * in the sheet behind the hamburger.
 *
 * Five is the ceiling: at 375px that is 75px a column, the least that fits an
 * icon above a label.
 */
const TAB_BAR_URLS = ["/", "/courses", "/dramas", "/songs", "/vocabulary"];

export function tabBarItemsFor(role: string | null | undefined): NavItem[] {
  const menu = navItemsFor(role);
  return TAB_BAR_URLS.flatMap((url) => menu.find((item) => item.url === url) ?? []);
}

/**
 * Whether `pathname` sits inside the section `url` names.
 *
 * "/" is the trap: a prefix match would mark Home active on every screen, so
 * the root only counts when it is the whole path.
 */
export function isNavItemActive(pathname: string, url: string): boolean {
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(`${url}/`);
}
