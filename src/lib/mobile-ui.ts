/**
 * Mobile-first UI recipes shared by the shadcn primitives.
 *
 * These class strings used to live as literals inside button.tsx / tabs.tsx /
 * dialog.tsx. They are collected here for one reason: the tap-target and
 * font-size rules below are testable only if there is a single place that
 * states them. `mobile-ui.test.ts` parses these strings and asserts the
 * resulting pixel sizes, which no amount of reading scattered className
 * literals could do.
 *
 * Convention: the unprefixed token is the PHONE value, `md:` steps back down
 * to the denser desktop value. Phones (and touch tablets in the 640–767px
 * band) therefore get the larger target by default.
 */

/** iOS/Android HIG floor for a comfortable touch target. */
export const MIN_TAP_TARGET_PX = 44;

/** `size` variants for `buttonVariants`. */
export const BUTTON_SIZE_CLASSES = {
  default: "h-11 px-4 py-2 md:h-9",
  /**
   * The compact toolbar button. Seventeen call sites used to reach this by
   * pinning `size="sm" className="h-7 px-2 text-xs"`, which put them back
   * under the phone floor — twMerge lets a caller's own h-* win. Naming the
   * shape here is what stops that from being re-invented.
   */
  xs: "h-11 rounded-md px-2 text-xs md:h-7",
  sm: "h-11 rounded-md px-3 text-xs md:h-8",
  lg: "h-12 rounded-md px-8 md:h-10",
  icon: "h-11 w-11 md:h-9 md:w-9",
} as const;

/**
 * Height for the single-line form controls — `Input` and the `Select` trigger.
 * They sit next to buttons in the same rows, so they follow the same phone
 * floor and the same md step-down.
 */
export const CONTROL_HEIGHT_CLASS = "h-11 md:h-9";

/**
 * The 🔊 pill that reads a Chinese line aloud. It is the most-tapped control
 * on a lesson screen — one sits beside every sentence — and it existed as
 * eight near-identical copies before `SpeakButton` collected them.
 *
 * Inline beside text it has to stay small, so md keeps the original pill and
 * only the phone gets a real button.
 */
export const SPEAK_BUTTON_SIZE_CLASSES = {
  sm: "min-h-11 px-3 text-xs md:min-h-0 md:px-2 md:py-0.5 md:text-[11px]",
  md: "min-h-11 px-3 text-xs md:min-h-0 md:px-2.5 md:py-1 md:text-xs",
} as const;

/** Icon inside the pill — bigger on the phone to match the bigger target. */
export const SPEAK_BUTTON_ICON_CLASSES = {
  sm: "size-4 md:size-3",
  md: "size-4 md:size-3.5",
} as const;

/**
 * Base classes for `TabsList`. On a phone the list carries no height of its
 * own and simply grows around the triggers, which is what lets the lesson and
 * song screens wrap their triggers onto several rows. The desktop `h-9` is
 * restored from md up.
 */
export const TABS_LIST_CLASS =
  "inline-flex items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground md:h-9";

/**
 * Base classes for `TabsTrigger`. The trigger, not the list, is the thing a
 * finger has to hit, so the floor lives here.
 */
export const TABS_TRIGGER_CLASS =
  "inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all md:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow";

/**
 * Geometry for `DialogContent` — the part that has to survive a 375px screen.
 * `w-full` used to run the panel edge to edge with square corners, and the
 * height was unbounded, so a long form ran off under the browser chrome.
 * `dvh` is what tracks a retracting URL bar; `vh` measures the largest
 * viewport and clips.
 */
export const DIALOG_CONTENT_CLASS =
  "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overscroll-contain rounded-2xl border bg-background p-4 shadow-lg sm:p-6 sm:rounded-lg";

/**
 * Text inputs that are not built on `ui/input`. iOS Safari zooms the viewport
 * when a focused field renders below 16px and never zooms back out, so the
 * phone value must stay at `text-base`.
 */
export const MOBILE_TEXT_INPUT_CLASS = "text-base md:text-sm";

/**
 * `<meta name="viewport">` content for the document head. `viewport-fit=cover`
 * is what makes the browser report non-zero `env(safe-area-inset-*)`, which
 * the `.pb-safe` / `.pt-safe` utilities in styles.css depend on.
 */
export const VIEWPORT_CONTENT = "width=device-width, initial-scale=1, viewport-fit=cover";
