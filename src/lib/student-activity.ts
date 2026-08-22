/**
 * How a student's last-activity gap is worded and coloured.
 *
 * The teacher view renders this twice — a table from md up, cards below it —
 * and both have to say the same thing about the same number. Deriving it here
 * keeps the two from drifting, and makes the thresholds checkable.
 */
export type IdleTone = "unknown" | "today" | "normal" | "stale";

/** A student is chased up after this many days without activity. */
export const STALE_AFTER_DAYS = 7;

export function idleTone(daysIdle: number | null | undefined): IdleTone {
  if (daysIdle == null || !Number.isFinite(daysIdle)) return "unknown";
  if (daysIdle >= STALE_AFTER_DAYS) return "stale";
  if (daysIdle === 0) return "today";
  return "normal";
}

export function idleLabel(daysIdle: number | null | undefined): string {
  if (daysIdle == null || !Number.isFinite(daysIdle)) return "—";
  if (daysIdle === 0) return "오늘";
  if (daysIdle === 1) return "어제";
  return `${daysIdle}일 전`;
}

const TONE_CLASS: Record<IdleTone, string> = {
  unknown: "text-muted-foreground/60",
  stale: "text-amber-700 font-semibold",
  today: "text-emerald-700",
  normal: "text-foreground",
};

export function idleToneClass(daysIdle: number | null | undefined): string {
  return TONE_CLASS[idleTone(daysIdle)];
}
