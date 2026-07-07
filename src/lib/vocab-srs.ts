// Lightweight SM-2-style spaced repetition. Pure functions — shared by
// the authenticated server functions and the guest localStorage store.

export type SrsGrade = 0 | 1 | 2; // 0 = 모름, 1 = 헷갈림, 2 = 암기

export type SrsState = {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
  dueAt: string; // ISO
  lastReviewedAt?: string;
};

export function initialSrs(now: Date = new Date()): SrsState {
  return {
    ease: 2.5,
    intervalDays: 0,
    reps: 0,
    lapses: 0,
    dueAt: now.toISOString(),
  };
}

export function applyGrade(
  state: SrsState,
  grade: SrsGrade,
  now: Date = new Date(),
): SrsState {
  let { ease, intervalDays, reps, lapses } = state;

  if (grade === 0) {
    reps = 0;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    intervalDays = 0; // 세션에서 즉시 재큐
  } else if (grade === 1) {
    reps += 1;
    ease = Math.max(1.3, ease - 0.05);
    intervalDays = reps <= 1 ? 1 : Math.max(1, intervalDays * 1.2);
  } else {
    reps += 1;
    ease = ease + 0.05;
    if (reps === 1) intervalDays = 1;
    else if (reps === 2) intervalDays = 3;
    else intervalDays = Math.max(1, intervalDays * ease);
  }

  const due = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return {
    ease,
    intervalDays,
    reps,
    lapses,
    dueAt: due.toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

export type SrsStatus = "new" | "due" | "learning" | "learned";

export function srsStatus(state: SrsState | undefined, now: Date = new Date()): SrsStatus {
  if (!state || state.reps === 0) return "new";
  const due = new Date(state.dueAt).getTime();
  if (due <= now.getTime()) return "due";
  if (state.intervalDays >= 21) return "learned";
  return "learning";
}

export function daysUntilDue(state: SrsState | undefined, now: Date = new Date()): number {
  if (!state) return 0;
  const diff = new Date(state.dueAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}
