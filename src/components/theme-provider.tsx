import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { useMyProfile, useSession } from "@/lib/auth-client";
import { saveThemePreference } from "@/lib/profile.functions";
import {
  DARK_CLASS,
  DARK_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  type ThemePreference,
} from "@/lib/theme";
import type { Profile } from "@/db/schema";

/**
 * Owns the theme for the whole app.
 *
 * Two stores on purpose. `profiles.theme` is the record — it follows the
 * account to another device. localStorage is a mirror, because the boot script
 * in `__root.tsx` runs before React and cannot reach the database; without the
 * mirror a signed-in user would be the only one still seeing the light flash.
 *
 * The state lives in a context rather than in the toggle, because the toggle
 * renders in three places (settings, the desktop menu, the mobile sheet) and
 * two of them are unmounted most of the time.
 */

type ThemeContextValue = {
  preference: ThemePreference;
  setTheme: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const profile = useMyProfile();
  const qc = useQueryClient();
  const save = useServerFn(saveThemePreference);

  // Read after mount only: the server does not know the preference, so
  // rendering it during SSR would produce markup the client has to correct.
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    if (session) {
      // Keep the stored value while the profile is still loading.
      if (!profile.data) return;
      const stored = parseThemePreference(profile.data.theme);
      setPreference(stored);
      // Refresh the mirror from the record, not only when the toggle is used.
      // On a second device the mirror starts empty, so without this every
      // reload there would paint light before the profile arrives.
      try {
        localStorage.setItem(THEME_STORAGE_KEY, stored);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      setPreference(parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY)));
    } catch {
      /* private windows throw on localStorage */
    }
  }, [session, profile.data]);

  // Apply, and re-apply when the OS flips while "system" is selected.
  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const apply = () =>
      document.documentElement.classList.toggle(
        DARK_CLASS,
        resolveTheme(preference, media.matches) === "dark",
      );
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setPreference(next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      if (!session) return;
      // Write the cache through as well: useMyProfile has a 60s staleTime, so
      // an invalidate alone would let the stale value win the next read.
      qc.setQueryData(["my-profile"], (old: Profile | null | undefined) =>
        old ? { ...old, theme: next } : old,
      );
      void save({ data: { theme: next } });
    },
    [session, qc, save],
  );

  return <ThemeContext.Provider value={{ preference, setTheme }}>{children}</ThemeContext.Provider>;
}
