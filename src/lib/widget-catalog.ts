/**
 * The widget set, and the rules for reading a layout that was saved when the
 * set was smaller.
 *
 * The ids used to be declared in `widgets.functions.ts` and their titles again
 * in `widget-panel.tsx`; a widget added to one and not the other rendered as a
 * blank card. Both now come from here, which is also what lets a test assert
 * that every id has exactly one label.
 *
 * Pure and client-safe on purpose — `widgets.functions.ts` is a server-function
 * module, so the panel importing its ids pulled a server boundary into the
 * browser bundle for the sake of a string array.
 */

export const WIDGET_IDS = [
  "quote",
  "vocab",
  "stats",
  "calendar",
  "continue",
  "lesson",
  "song",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export const WIDGET_META: Record<WidgetId, { title: string; emoji: string }> = {
  quote: { title: "오늘의 명언", emoji: "💬" },
  vocab: { title: "오늘의 단어", emoji: "🃏" },
  stats: { title: "학습 현황", emoji: "📊" },
  calendar: { title: "학습 캘린더", emoji: "📅" },
  continue: { title: "이어보기", emoji: "▶️" },
  lesson: { title: "수업 이어하기", emoji: "📖" },
  song: { title: "오늘의 학습송", emoji: "🎵" },
};

/**
 * What an account sees before it has ever opened edit mode. Adding an id here
 * reaches new and untouched accounts only — `sanitizeLayout` deliberately does
 * not splice it into a layout someone already arranged.
 */
export const DEFAULT_LAYOUT: WidgetId[] = ["quote", "vocab", "stats", "calendar"];

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === "string" && (WIDGET_IDS as readonly string[]).includes(value);
}

/**
 * Normalises a stored layout.
 *
 * The distinction that matters: an empty array is a choice (the user removed
 * every widget) and stays empty, while a missing or malformed value has never
 * been a choice and falls back to the default. Unknown ids — a widget that was
 * renamed or withdrawn — drop out without disturbing the order of the rest.
 */
export function sanitizeLayout(raw: unknown): WidgetId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_LAYOUT];
  const seen = new Set<WidgetId>();
  for (const value of raw) if (isWidgetId(value)) seen.add(value);
  return [...seen];
}

/* ── 🃏 오늘의 단어 ────────────────────────────────────────────────────── */

export type DueWord = { id: string; zh: string };

/**
 * One card at a time, and the same card across re-renders — picking at random
 * on every render would swap the word under the learner's finger between the
 * read and the tap.
 */
export function pickDueWord<T extends DueWord>(queue: readonly T[], daySeed: number): T | null {
  if (queue.length === 0) return null;
  return queue[Math.abs(daySeed) % queue.length] ?? null;
}

/** The graded word leaves the queue, so it cannot be asked again immediately. */
export function advanceQueue<T extends DueWord>(queue: readonly T[], gradedId: string): T[] {
  return queue.filter((word) => word.id !== gradedId);
}
