import { Volume2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { SPEAK_BUTTON_ICON_CLASSES, SPEAK_BUTTON_SIZE_CLASSES } from "@/lib/mobile-ui";

/** Enough of the line to tell two buttons apart, read aloud in under a breath. */
const MAX_LABEL_CHARS = 24;

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= MAX_LABEL_CHARS ? flat : `${flat.slice(0, MAX_LABEL_CHARS)}…`;
}

/**
 * The 🔊 pill that reads a Chinese line aloud.
 *
 * This existed as eight near-identical copies — two of them byte-for-byte the
 * same component in two files — which is why the phone tap target was wrong in
 * all eight and why two of them shipped with no accessible name at all. One
 * component means one decision about size, and a name that cannot be forgotten.
 *
 * Sizing lives in mobile-ui.ts so the 44px floor is asserted in px rather than
 * eyeballed: inline beside Chinese text the pill has to stay small from md up,
 * so only the phone gets a full-size button.
 */
export function SpeakButton({
  text,
  speak,
  active,
  size = "md",
  iconOnly = false,
  label,
  className,
}: {
  text: string;
  speak: (text: string, id?: string) => void;
  /** True while this line is the one being read. */
  active: boolean;
  size?: "sm" | "md";
  /** Drop the caption where the row has no room for it. */
  iconOnly?: boolean;
  label?: string;
  /** Positioning only (`ml-1`, `shrink-0`); the size belongs to the component. */
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => speak(text, text)}
      // Always labelled: an icon-only button is nameless to a screen reader,
      // and two of the copies this replaces were exactly that. Truncated
      // because "전체 듣기" is handed the whole lesson, and a button whose
      // name is a thousand characters is no more usable than a nameless one.
      aria-label={`중국어 듣기: ${excerpt(text)}`}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/20",
        SPEAK_BUTTON_SIZE_CLASSES[size],
        active && "animate-pulse bg-primary/30",
        className,
      )}
    >
      <Volume2 className={SPEAK_BUTTON_ICON_CLASSES[size]} />
      {!iconOnly && (label ?? "듣기")}
    </button>
  );
}
