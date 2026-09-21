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

/** 방문만으로는 기록하지 않는 탭. 끝까지 풀어야 "학습한 섹션"이 된다. */
export const QUIZ_TAB = "quiz";

/**
 * 탭을 열었을 때 새로 기록할 목록. 이미 있거나 퀴즈 탭이면 null(저장하지 않는다).
 *
 * 퀴즈도 여는 순간 기록되던 때가 있었다: 운영 진도 35건 중 17건에 "quiz"가
 * 있었지만 점수가 남은 것은 1건이었고, 학습 결과 PDF는 풀지 않은 퀴즈를
 * "✅ 학습한 섹션"으로 찍었다.
 */
export function tabsAfterVisit(completed: string[], tab: string): string[] | null {
  if (tab === QUIZ_TAB || completed.includes(tab)) return null;
  return [...completed, tab];
}

/** 퀴즈를 끝까지 풀어 점수가 나왔을 때의 목록. */
export function tabsAfterQuiz(completed: string[]): string[] {
  return completed.includes(QUIZ_TAB) ? completed : [...completed, QUIZ_TAB];
}
