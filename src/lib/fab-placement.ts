/** Gap kept between the floating button and the viewport edge. */
export const FAB_MARGIN = 24;

export type FabClampInput = {
  y: number;
  viewportHeight: number;
  fabHeight: number;
  /** `env(safe-area-inset-bottom)` — the home-indicator strip, 0 on most devices. */
  bottomInset: number;
  /** Fixed page chrome along the bottom — the phone tab bar. 0 on desktop. */
  bottomReserved?: number;
};

/**
 * The vertical resting spot, held inside the usable part of the viewport.
 *
 * `viewportHeight` includes the home-indicator strip in a standalone PWA, so
 * clamping against it alone lets the button be dropped underneath the
 * indicator, where the OS eats the touch.
 *
 * When the viewport is shorter than the button plus both margins the bounds
 * cross over. Pinning to the top edge is the sane answer there — the
 * alternative is a lower bound above the upper one, which yields whichever
 * value the comparison happens to see first.
 */
export function clampFabY({
  y,
  viewportHeight,
  fabHeight,
  bottomInset,
  bottomReserved = 0,
}: FabClampInput): number {
  // Both strips stack: the tab bar sits on top of the home indicator, so the
  // button has to clear their sum, not whichever is larger.
  const inset = Number.isFinite(bottomInset) ? Math.max(bottomInset, 0) : 0;
  const reserved = Number.isFinite(bottomReserved) ? Math.max(bottomReserved, 0) : 0;
  const lo = FAB_MARGIN;
  const hi = viewportHeight - fabHeight - FAB_MARGIN - inset - reserved;
  return Math.min(Math.max(y, lo), Math.max(lo, hi));
}
