// Guest-friendly per-lesson progress stored in localStorage.
// Logged-in users use the same client-side cache; server dashboard sync can be added later.

export type LessonProgress = {
  completedTabs: string[]; // e.g. ["key","content","dialogue","slides","quiz"]
  quizScore?: { correct: number; total: number };
  updatedAt: string;
};

const KEY = (id: string) => `dingdong:progress:lesson:${id}`;

export function loadProgress(lessonId: string): LessonProgress {
  if (typeof window === "undefined")
    return { completedTabs: [], updatedAt: new Date().toISOString() };
  try {
    const raw = localStorage.getItem(KEY(lessonId));
    if (!raw) return { completedTabs: [], updatedAt: new Date().toISOString() };
    return JSON.parse(raw) as LessonProgress;
  } catch {
    return { completedTabs: [], updatedAt: new Date().toISOString() };
  }
}

export function saveProgress(lessonId: string, patch: Partial<LessonProgress>) {
  if (typeof window === "undefined") return;
  const cur = loadProgress(lessonId);
  const next: LessonProgress = {
    ...cur,
    ...patch,
    completedTabs: Array.from(
      new Set([...(cur.completedTabs ?? []), ...(patch.completedTabs ?? [])]),
    ),
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY(lessonId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
