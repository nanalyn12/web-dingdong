/**
 * Light / dark / system theme.
 *
 * `styles.css` has carried a full `.dark` token block and the
 * `@custom-variant dark (&:is(.dark *))` hook since the design system was
 * written — nothing ever put the class on `<html>`. This module is the missing
 * half: the preference, its fallback, and the script that applies it before
 * the first paint.
 *
 * Everything here is pure and framework-free so the gate can judge it. The
 * boot script is a string rather than a function because it has to run in the
 * document head before any module loads; building it from the same constants
 * the app uses is what stops the key or the class name from drifting on one
 * side only.
 */

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** What the preference resolves to once the OS setting is known. */
export type ResolvedTheme = "light" | "dark";

/**
 * Signed-in users keep the preference in `profiles.theme`, but the boot script
 * cannot reach the database. localStorage is the cache it reads; the column is
 * the record of truth that follows the user to another device.
 */
export const THEME_STORAGE_KEY = "dd-theme";

/** The class `@custom-variant dark` is keyed on. */
export const DARK_CLASS = "dark";

export const THEME_LABELS: Record<ThemePreference, string> = {
  light: "라이트",
  dark: "다크",
  system: "시스템 설정",
};

/**
 * Anything unrecognised becomes `"system"`. Every profile row that existed
 * before the column was added arrives here as NULL, so this is the common
 * path, not the error path.
 */
export function parseThemePreference(raw: unknown): ThemePreference {
  return (THEME_PREFERENCES as readonly unknown[]).includes(raw)
    ? (raw as ThemePreference)
    : "system";
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

/** The media query both the boot script and the runtime listener watch. */
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in `<head>`, before the stylesheet paints. Without it a user who chose
 * dark sees a pastel flash on every navigation that reloads the document.
 *
 * Wrapped in try/catch on purpose: private windows and blocked site data throw
 * on `localStorage` access, and a theme preference is not worth taking the
 * page down for.
 */
export const THEME_BOOT_SCRIPT = [
  "try{",
  `var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});`,
  'if(p!=="light"&&p!=="dark")p="system";',
  `var d=p===${JSON.stringify("dark")}||(p==="system"&&window.matchMedia(${JSON.stringify(DARK_MEDIA_QUERY)}).matches);`,
  `document.documentElement.classList.toggle(${JSON.stringify(DARK_CLASS)},d);`,
  "}catch(e){}",
].join("");
