/** Widths below this are phones; it matches Tailwind's `md`. */
export const TOUR_MIN_WIDTH = 768;

/**
 * Whether a tour is allowed to start by itself at this viewport width.
 *
 * driver.js anchors its popover beside the element it highlights. On a phone
 * there is no beside — the popover covers the very thing it points at, and its
 * own buttons render at 28px. Worse, the sidebar tour describes a sidebar that
 * is `hidden md:flex`, so on a phone it narrates something that is not there.
 *
 * This gates the *automatic* start only. Asking for a tour on purpose (the
 * help button, or "이 페이지 둘러보기" in the mobile sheet) passes `force` and
 * still runs — a learner who taps it should get what they asked for.
 */
export function shouldAutoRunTour(width: number | undefined): boolean {
  if (typeof width !== "number" || !Number.isFinite(width)) return false;
  return width >= TOUR_MIN_WIDTH;
}
