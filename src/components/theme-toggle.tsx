import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { THEME_LABELS, THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * Three segments, not a two-state switch: "시스템 설정" is the default every
 * account starts on, and a switch would have to hide it behind a long press.
 *
 * Built on `Button` rather than a raw `<button>` so the tap-target guard in
 * `mobile-density.test.ts` can see these — its CONTROL pattern only looks at
 * the primitives, and a raw element walks straight past it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="화면 테마"
      className={cn("flex items-center gap-1 rounded-xl bg-muted p-1", className)}
    >
      {THEME_PREFERENCES.map((value) => {
        const Icon = ICONS[value];
        const active = preference === value;
        return (
          <Button
            key={value}
            type="button"
            variant="ghost"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "flex-1 gap-1.5 rounded-lg px-2 text-xs font-medium",
              active
                ? "bg-background text-foreground shadow-sm hover:bg-background"
                : "text-muted-foreground",
            )}
          >
            <Icon />
            {THEME_LABELS[value]}
          </Button>
        );
      })}
    </div>
  );
}
