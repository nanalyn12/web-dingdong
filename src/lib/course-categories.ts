// The landing page's "메뉴판" categories, and how they map onto courses.
//
// `courses` has no category column — only title, description and level — so a
// category is matched by keyword against the course's text. Courses are
// generated from a keyword ("중국 상하이 여행" 키워드로 생성된 영상 강의 모음),
// so that text is descriptive enough for this to work without a migration.
//
// Both the landing cards and the /courses filter read this list, so a category
// cannot exist on one page and mean something else on the other.

export type CourseCategory = {
  key: string;
  emoji: string;
  label: string;
  /** Tailwind class for the tile. */
  chip: string;
  /** Any hit against the course title or description selects the course. */
  keywords: string[];
};

export const COURSE_CATEGORIES: CourseCategory[] = [
  {
    key: "daily",
    emoji: "🧋",
    label: "일상 회화",
    chip: "bg-pink/50",
    keywords: ["일상", "생활", "회화", "인사", "신조어", "실전 중국어", "배달", "틀리는"],
  },
  {
    key: "travel",
    emoji: "✈️",
    label: "여행 중국어",
    chip: "bg-sky/50",
    keywords: ["여행", "관광", "상하이", "지하철", "교통", "호텔", "공항"],
  },
  {
    key: "business",
    emoji: "💼",
    label: "비즈니스",
    chip: "bg-lavender/50",
    keywords: ["비즈니스", "출장", "회사", "업무", "무역", "협상", "이메일"],
  },
  {
    key: "drama",
    emoji: "🎬",
    label: "드라마·영화",
    chip: "bg-mint/50",
    // No bare "배우" — it matches "배우다" in half the course titles.
    keywords: ["드라마", "영화", "중드", "대사", "클리셰", "사극", "고장극", "주연"],
  },
  {
    key: "culture",
    emoji: "🥟",
    label: "음식·문화",
    chip: "bg-pink/50",
    // Bare "문화" would swallow most of the catalogue — nearly every course
    // description mentions it. The specific nouns are what identify this one.
    keywords: ["음식", "요리", "맛집", "웹소설", "음악", "명절", "전통", "역사", "차(茶)"],
  },
  {
    key: "hsk",
    emoji: "📝",
    label: "HSK 시험",
    chip: "bg-sky/50",
    keywords: ["HSK", "시험", "급수", "어법", "문법", "독해", "듣기 평가"],
  },
];

export function findCategory(key: string | undefined): CourseCategory | null {
  if (!key) return null;
  return COURSE_CATEGORIES.find((c) => c.key === key) ?? null;
}

/** Does this course belong to the category? Case-insensitive substring match
 * over the title and description. */
export function courseMatchesCategory(
  course: { title: string; description?: string | null },
  category: CourseCategory,
): boolean {
  const haystack = `${course.title} ${course.description ?? ""}`.toLowerCase();
  return category.keywords.some((k) => haystack.includes(k.toLowerCase()));
}
