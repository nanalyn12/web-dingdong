import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { runTour } from "@/lib/coachmark";
import { coursesTourSteps } from "@/lib/tour-steps";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  createCourse,
  updateCourse,
  listCoursesWithCounts,
  listCoursesWithLessons,
  updateLesson,
  deleteLesson,
  deleteCourse,
  moveLessons,
  mergeCourses,
  splitCourse,
  type CourseWithCount,
  type CourseWithLessons,
} from "@/lib/courses.functions";

import { useIsEditor } from "@/lib/auth-client";
import { generateLesson } from "@/lib/generate-lesson.functions";
import { courseMatchesCategory, findCategory } from "@/lib/course-categories";
import { LEVEL_LABEL_HSK, LEVEL_OPTIONS, LEVEL_ORDER, levelLabelHsk } from "@/lib/levels";

type Level = "beginner" | "intermediate" | "advanced";

type SortKey = "newest" | "oldest" | "title";

const SORT_LABEL: Record<SortKey, string> = {
  newest: "최신순",
  oldest: "오래된순",
  title: "가나다순",
};

// The server hands the list back newest-first, so "newest" is a no-op reorder
// and stays the default. Korean titles do not sort correctly by code point —
// localeCompare with an explicit locale keeps 가/나/다 in the expected order
// and puts Latin-titled courses somewhere predictable.
const SORTERS: Record<SortKey, (a: CourseWithCount, b: CourseWithCount) => number> = {
  newest: (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  oldest: (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  title: (a, b) => a.title.localeCompare(b.title, "ko"),
};

// Narration language of a course's video lessons. "모든 영상" also keeps courses
// that have no video lesson at all — filtering those away would hide every
// hand-written course behind a control that only describes videos.
type LangKey = "all" | "ko" | "zh";

const LANG_LABEL: Record<LangKey, string> = {
  all: "모든 영상",
  ko: "한국어 나레이션",
  zh: "중국어 나레이션",
};

export const Route = createFileRoute("/_app/courses/")({
  head: () => ({
    meta: [
      { title: "강의 — DingDong" },
      {
        name: "description",
        content: "DingDong의 모든 중국어 학습 강의를 둘러보세요.",
      },
    ],
  }),
  // `cat` comes from the landing page's category tiles. Unknown values are
  // simply ignored, so a stale or hand-edited link still shows every course.
  // Optional on purpose: returning the key as `string | undefined` would make
  // it required, forcing every existing <Link to="/courses"> to pass a search.
  validateSearch: (search: Record<string, unknown>): { cat?: string } =>
    typeof search.cat === "string" ? { cat: search.cat } : {},
  component: CoursesPage,
});

function CoursesPage() {
  const isEditor = useIsEditor();
  const { cat } = Route.useSearch();
  const navigate = useNavigate();
  const category = findCategory(cat);
  const { data: courses, isLoading, error } = useQuery({
    queryKey: ["courses-with-counts"],
    queryFn: () => listCoursesWithCounts(),
  });
  const [levelFilter, setLevelFilter] = useState<"all" | Level>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [lang, setLang] = useState<LangKey>("all");

  useEffect(() => {
    const t = setTimeout(() => runTour("courses", coursesTourSteps()), 700);
    return () => clearTimeout(t);
  }, []);

  // filter() already returns a fresh array, so sorting it in place never
  // reorders the react-query cache.
  const filtered = (courses ?? [])
    .filter((c) => (category ? courseMatchesCategory(c, category) : true))
    .filter((c) => (levelFilter === "all" ? true : c.level === levelFilter))
    .filter((c) => (lang === "all" ? true : (c.video_languages ?? []).includes(lang)))
    .sort(SORTERS[sort]);
  const totalLessons = (courses ?? []).reduce(
    (s, c) => s + (c.lesson_count ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      {isEditor && (
        <div data-tour="course-create">
          <CreateCourseForm />
        </div>
      )}

      <section data-tour="course-list" className="space-y-5">
        <div className="glass rounded-3xl p-6 md:p-7 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">
              {category ? `${category.emoji} ${category.label}` : "강의 목록"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {!courses
                ? "강의를 불러오는 중…"
                : category
                  ? `${category.label} 관련 강의 ${filtered.length}개`
                  : `총 ${courses.length}개 강의 · 세부 강의 ${totalLessons}개`}
            </p>
            {category && (
              <button
                type="button"
                onClick={() => navigate({ to: "/courses", search: {} })}
                className="mt-2 text-xs font-medium text-primary hover:opacity-80"
              >
                ← 전체 강의 보기
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <div className="inline-flex rounded-2xl bg-white/60 border border-white/60 p-1">
              {([
                ["all", "전체"] as const,
                ...LEVEL_OPTIONS.map((l) => [l.value, l.label] as const),
              ]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLevelFilter(key)}
                  className={[
                    "px-3 py-1.5 rounded-xl text-xs font-medium transition",
                    levelFilter === key
                      ? "gradient-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
            <Select value={lang} onValueChange={(v) => setLang(v as LangKey)}>
              <SelectTrigger
                aria-label="영상 나레이션 언어"
                className="h-9 w-[142px] rounded-2xl bg-white/60 border-white/60 text-xs font-medium"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LANG_LABEL) as LangKey[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {LANG_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger
                aria-label="정렬 기준"
                className="h-9 w-[116px] rounded-2xl bg-white/60 border-white/60 text-xs font-medium"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {SORT_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading && (
          <p className="text-muted-foreground px-2">불러오는 중…</p>
        )}
        {error && (
          <p className="text-destructive whitespace-pre-wrap px-2">
            {(error as Error).message}
          </p>
        )}
        {courses && courses.length === 0 && (
          <div className="glass rounded-3xl p-10 text-center">
            <div className="text-4xl mb-3">🐼</div>
            <p className="text-muted-foreground">
              아직 강의가 없어요. {isEditor ? "위에서 첫 강의를 만들어 보세요." : "곧 새 강의가 열려요!"}
            </p>
          </div>
        )}
        {courses && courses.length > 0 && filtered.length === 0 && (
          // Arriving from a category tile and finding nothing needs more than
          // a one-liner — say which category is empty and offer a way out.
          <div className="glass rounded-3xl p-10 text-center space-y-3">
            <div className="text-4xl">{category?.emoji ?? "🔍"}</div>
            <p className="text-muted-foreground">
              {lang !== "all"
                ? `${LANG_LABEL[lang]} 영상이 있는 강의가 아직 없어요.`
                : category
                  ? `아직 ${category.label} 강의가 준비되지 않았어요.`
                  : "선택한 난이도의 강의가 아직 없어요."}
            </p>
            {category && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: "/courses", search: {} })}
              >
                전체 강의 보기
              </Button>
            )}
          </div>
        )}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      </section>
    </div>
  );
}

const WEEKS_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 1);

function CreateCourseForm() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const create = useServerFn(createCourse);
  const generate = useServerFn(generateLesson);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [weeks, setWeeks] = useState<number>(1);
  const [autoGenerate, setAutoGenerate] = useState(true);

  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setLevel("beginner");
    setWeeks(1);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    setGenError(null);
    setProgress(null);
    try {
      const courseTitle = title.trim();
      const { courseId } = await create({
        data: {
          title: courseTitle,
          description,
          level,
          weeks,
        },
      });
      qc.invalidateQueries({ queryKey: ["courses-with-counts"] });
      qc.invalidateQueries({ queryKey: ["sidebar-courses-with-lessons"] });

      if (!autoGenerate) {
        reset();
        return;
      }

      setProgress({ current: 0, total: weeks });
      let firstLessonId: string | null = null;
      for (let i = 1; i <= weeks; i++) {
        setProgress({ current: i, total: weeks });
        try {
          const res = await generate({
            data: {
              courseId,
              courseName: courseTitle,
              lessonTitle: "",
              level,
            },
          });
          if (!firstLessonId) firstLessonId = res.lessonId;
          qc.invalidateQueries({ queryKey: ["courses-with-counts"] });
          qc.invalidateQueries({ queryKey: ["sidebar-courses-with-lessons"] });
        } catch (err) {
          setGenError(
            `${i}주차 생성 실패: ${
              err instanceof Error ? err.message : String(err)
            }\n부족한 주차는 아래 코스 카드에서 다시 생성할 수 있어요.`,
          );
          break;
        }
      }
      reset();
      setProgress(null);
      if (firstLessonId) {
        navigate({ to: "/lessons/$id", params: { id: firstLessonId } });
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="glass rounded-3xl p-8">
      <h1 className="text-3xl font-bold">강의 만들기</h1>
      <p className="mt-2 text-muted-foreground">
        주차 수를 선택하면 叮叮이 그만큼의 세부 강의를 한 번에 만들어요.
      </p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="course-title">제목 *</Label>
          <Input
            id="course-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 일상 대화 초급"
            required
            disabled={creating}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="course-desc">설명</Label>
          <Textarea
            id="course-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="이 코스에서 배우는 내용을 간단히 적어주세요."
            disabled={creating}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>난이도 *</Label>
            <Select
              value={level}
              onValueChange={(v) => setLevel(v as Level)}
              disabled={creating}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_ORDER.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LEVEL_LABEL_HSK[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>몇 주차 강의 *</Label>
            <Select
              value={String(weeks)}
              onValueChange={(v) => setWeeks(Number(v))}
              disabled={creating}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKS_OPTIONS.map((w) => (
                  <SelectItem key={w} value={String(w)}>
                    {w}주차
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={autoGenerate}
            onChange={(e) => setAutoGenerate(e.target.checked)}
            disabled={creating}
            className="size-4 rounded border-primary/40 accent-primary"
          />
          선택한 주차 수만큼 세부 강의를 자동으로 생성 (권장)
        </label>

        {progress && (
          <div className="rounded-2xl bg-primary/10 border border-primary/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="size-4 animate-spin" />
              叮叮이 {progress.current}/{progress.total}주차 세부 강의를 만드는
              중… (각 10~30초)
            </div>
            <div className="h-2 rounded-full bg-white/60 overflow-hidden">
              <div
                className="h-full gradient-primary transition-all"
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {genError && (
          <p className="text-destructive whitespace-pre-wrap text-sm">
            {genError}
          </p>
        )}

        <Button type="submit" disabled={creating}>
          {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
          {autoGenerate
            ? `강의 + ${weeks}개 세부 강의 만들기 ✨`
            : "강의 만들기"}
        </Button>
      </form>
    </section>
  );
}


function CourseCard({ course }: { course: CourseWithCount }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEditor = useIsEditor();
  const generate = useServerFn(generateLesson);
  const removeCourse = useServerFn(deleteCourse);
  const courseLevel = (
    ["beginner", "intermediate", "advanced"].includes(course.level)
      ? course.level
      : "beginner"
  ) as Level;

  const deleteCourseM = useMutation({
    mutationFn: () => removeCourse({ data: { courseId: course.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses-with-counts"] });
      qc.invalidateQueries({ queryKey: ["sidebar-courses-with-lessons"] });
    },
  });


  const [lessonTitle, setLessonTitle] = useState("");
  const [level, setLevel] = useState<Level>(courseLevel);

  const mutation = useMutation({
    mutationFn: (vars: { lessonTitle: string; level: Level }) =>
      generate({
        data: {
          courseId: course.id,
          courseName: course.title,
          lessonTitle: vars.lessonTitle,
          level: vars.level,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["courses-with-counts"] });
      qc.invalidateQueries({ queryKey: ["sidebar-courses-with-lessons"] });
      navigate({ to: "/lessons/$id", params: { id: res.lessonId } });
    },
  });

  // Find first lesson (for "학습 시작" CTA) from the sidebar cache
  const { data: coursesWithLessons } = useQuery({
    queryKey: ["sidebar-courses-with-lessons"],
    queryFn: () => listCoursesWithLessons(),
  });
  const firstLessonId = coursesWithLessons?.find((c) => c.id === course.id)
    ?.lessons?.[0]?.id;

  const accent = {
    // Amber/orange was the one accent outside the pink–sky–mint–lavender
    // palette, and beginner cards are the bulk of the list. Mint matches the
    // 🌱 chip the same level already uses elsewhere.
    beginner: {
      bar: "bg-gradient-to-b from-emerald-300 to-teal-500",
      pill: "bg-emerald-500/15 text-emerald-700",
      ring: "text-emerald-500",
      glow: "hover:shadow-[0_10px_30px_-12px_rgba(16,185,129,0.4)]",
    },
    intermediate: {
      bar: "bg-gradient-to-b from-rose-400 to-pink-500",
      pill: "bg-rose-500/15 text-rose-700",
      ring: "text-rose-500",
      glow: "hover:shadow-[0_10px_30px_-12px_rgba(251,113,133,0.45)]",
    },
    advanced: {
      bar: "bg-gradient-to-b from-violet-500 to-purple-600",
      pill: "bg-violet-500/15 text-violet-700",
      ring: "text-violet-500",
      glow: "hover:shadow-[0_10px_30px_-12px_rgba(139,92,246,0.45)]",
    },
  }[courseLevel];

  const progress = Math.min(course.lesson_count, course.weeks);
  const pct = course.weeks > 0 ? progress / course.weeks : 0;

  return (
    <div
      className={[
        "group relative glass-soft rounded-3xl overflow-hidden transition-all duration-300",
        "hover:-translate-y-0.5",
        accent.glow,
      ].join(" ")}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accent.bar}`} />

      <div className="p-5 pl-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${accent.pill}`}>
                {levelLabelHsk(courseLevel)}
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/50 text-foreground">
                {course.weeks}주차 과정
              </span>
            </div>
            {/* The body opens the course, where the lesson list lives; the CTA
                below still jumps straight into the lesson itself. */}
            <Link
              to="/courses/$id"
              params={{ id: course.id }}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <h3 className="text-lg font-bold leading-tight line-clamp-2 hover:text-primary transition-colors">
                {course.title}
              </h3>
              {course.description && (
                <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                  {course.description}
                </p>
              )}
            </Link>
          </div>

          {/* Progress ring */}
          <div className="shrink-0 relative w-14 h-14">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-white/60" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                className={accent.ring}
                stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${pct * 100} 100`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span className="text-sm font-bold">{progress}</span>
              <span className="text-[9px] text-muted-foreground">/{course.weeks}</span>
            </div>
          </div>
        </div>

        {/* Progress caption */}
        <p className="text-xs text-muted-foreground">
          {course.lesson_count > 0
            ? `${course.weeks}주 중 ${progress}주차 준비됨 · 세부 강의 ${course.lesson_count}개`
            : "아직 세부 강의가 준비되지 않았어요"}
        </p>

        {/* CTA */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="flex-1 rounded-2xl"
            disabled={!firstLessonId}
            onClick={() => {
              if (firstLessonId) navigate({ to: "/lessons/$id", params: { id: firstLessonId } });
            }}
          >
            {firstLessonId ? "학습 시작 →" : "아직 준비 중"}
          </Button>
          {isEditor && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-2 text-xs text-destructive hover:text-destructive"
              disabled={deleteCourseM.isPending}
              onClick={() => {
                if (
                  confirm(
                    `"${course.title}" 강의를 삭제할까요?\n포함된 세부 강의도 모두 삭제됩니다.`,
                  )
                ) {
                  deleteCourseM.mutate();
                }
              }}
            >
              {deleteCourseM.isPending ? "삭제 중…" : "삭제"}
            </Button>
          )}
        </div>
        {deleteCourseM.error && (
          <p className="text-destructive text-xs whitespace-pre-wrap">
            {(deleteCourseM.error as Error).message}
          </p>
        )}

        {/* Editor tools — collapsed */}
        {isEditor && (
          <details className="group/details rounded-2xl border border-white/40 bg-white/30 open:bg-white/40 transition">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-muted-foreground flex items-center justify-between">
              <span>편집자 도구 · 세부 강의 관리</span>
              <span className="text-[10px] opacity-70 group-open/details:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-4">
              <CourseEditDialog course={course} />
              <CourseStructureDialog course={course} />
              <Button
                size="sm"
                variant="outline"
                className="w-full rounded-xl text-xs"
                onClick={() =>
                  navigate({ to: "/studio", search: { courseId: course.id } })
                }
              >
                🎬 이 강의에 새 영상 강의 만들기
              </Button>
              <LessonListEditor courseId={course.id} />
              <form
                className="space-y-3 pt-3 border-t border-white/30"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (mutation.isPending) return;
                  mutation.mutate({ lessonTitle: lessonTitle.trim(), level });
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`lt-${course.id}`} className="text-xs">
                    새 세부 강의 제목 <span className="text-muted-foreground">(선택 — 비우면 AI가 자동 생성)</span>
                  </Label>
                  <Input
                    id={`lt-${course.id}`}
                    value={lessonTitle}
                    onChange={(e) => setLessonTitle(e.target.value)}
                    placeholder="비워두면 叮叮이 흐름에 맞춰 제목까지 만들어요"
                    disabled={mutation.isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">난이도</Label>
                  <Select
                    value={level}
                    onValueChange={(v) => setLevel(v as Level)}
                    disabled={mutation.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVEL_ORDER.map((l) => (
                        <SelectItem key={l} value={l}>
                          {LEVEL_LABEL_HSK[l]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {mutation.isPending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    叮叮이 세부 강의를 만드는 중… (10~30초)
                  </div>
                )}
                {mutation.error && (
                  <p className="text-destructive whitespace-pre-wrap text-xs">
                    {(mutation.error as Error).message}
                  </p>
                )}

                <Button
                  type="submit"
                  size="sm"
                  className="w-full"
                  disabled={mutation.isPending}
                >
                  {lessonTitle.trim() ? "세부 강의 생성" : "AI에게 제목+콘텐츠 맡기기 ✨"}
                </Button>
              </form>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/** 강의 구조 편집: 레슨 이동 / 강의 분리 / 강의 합치기 */
/** Edit a course's own title/description/level/weeks.
 *
 * The list could create, delete, move and merge courses but never rename one,
 * so a typo in a title was only fixable by deleting the course and its
 * lessons. */
function CourseEditDialog({ course }: { course: CourseWithCount }) {
  const qc = useQueryClient();
  const save = useServerFn(updateCourse);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [level, setLevel] = useState<Level>(
    LEVEL_ORDER.includes(course.level as Level) ? (course.level as Level) : "beginner",
  );
  const [weeks, setWeeks] = useState(course.weeks);

  // Reopening after a cancel should show what is stored, not the abandoned edit.
  useEffect(() => {
    if (!open) return;
    setTitle(course.title);
    setDescription(course.description ?? "");
    setLevel(
      LEVEL_ORDER.includes(course.level as Level) ? (course.level as Level) : "beginner",
    );
    setWeeks(course.weeks);
  }, [open, course]);

  const saveMut = useMutation({
    mutationFn: () =>
      save({ data: { courseId: course.id, title: title.trim(), description, level, weeks } }),
    onSuccess: (r) => {
      toast.success(
        r.weeks !== weeks
          ? `저장했어요. 세부 강의가 ${r.weeks}개라 주차는 ${r.weeks}주로 맞췄어요.`
          : "강의 정보를 저장했어요.",
      );
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["courses-with-counts"] });
      qc.invalidateQueries({ queryKey: ["sidebar-courses-with-lessons"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "저장 실패"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full rounded-xl text-xs">
          ✏️ 강의 정보 수정 (제목·설명·난이도)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">강의 정보 수정</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || saveMut.isPending) return;
            saveMut.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`edit-title-${course.id}`}>제목 *</Label>
            <Input
              id={`edit-title-${course.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              required
              disabled={saveMut.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-desc-${course.id}`}>설명</Label>
            <Textarea
              id={`edit-desc-${course.id}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="이 코스에서 배우는 내용을 간단히 적어주세요."
              disabled={saveMut.isPending}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>난이도 *</Label>
              <Select
                value={level}
                onValueChange={(v) => setLevel(v as Level)}
                disabled={saveMut.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVEL_ORDER.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LEVEL_LABEL_HSK[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>몇 주차 강의 *</Label>
              <Select
                value={String(weeks)}
                onValueChange={(v) => setWeeks(Number(v))}
                disabled={saveMut.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKS_OPTIONS.map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      {w}주차
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            난이도를 바꿔도 이미 만들어진 세부 강의의 난이도는 그대로예요.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={saveMut.isPending}
            >
              취소
            </Button>
            <Button type="submit" disabled={!title.trim() || saveMut.isPending}>
              {saveMut.isPending ? "저장 중…" : "저장"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CourseStructureDialog({ course }: { course: CourseWithCount }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [splitTitle, setSplitTitle] = useState("");

  const move = useServerFn(moveLessons);
  const merge = useServerFn(mergeCourses);
  const split = useServerFn(splitCourse);

  const { data } = useQuery({
    queryKey: ["sidebar-courses-with-lessons"],
    queryFn: () => listCoursesWithLessons(),
  });
  const lessons = data?.find((c) => c.id === course.id)?.lessons ?? [];
  const otherCourses = (data ?? []).filter((c) => c.id !== course.id);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["courses-with-counts"] });
    qc.invalidateQueries({ queryKey: ["sidebar-courses-with-lessons"] });
  };

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const moveMut = useMutation({
    mutationFn: () =>
      move({ data: { lessonIds: selected, targetCourseId: moveTarget } }),
    onSuccess: (r) => {
      toast.success(`세부 강의 ${r.moved}개를 이동했어요.`);
      setSelected([]);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "이동 실패"),
  });

  const splitMut = useMutation({
    mutationFn: () =>
      split({
        data: {
          sourceCourseId: course.id,
          lessonIds: selected,
          title: splitTitle.trim(),
        },
      }),
    onSuccess: () => {
      toast.success(`"${splitTitle.trim()}" 강의로 분리했어요.`);
      setSelected([]);
      setSplitTitle("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "분리 실패"),
  });

  const mergeMut = useMutation({
    mutationFn: () =>
      merge({
        data: { sourceCourseId: course.id, targetCourseId: mergeTarget },
      }),
    onSuccess: () => {
      toast.success("강의를 합쳤어요.");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "합치기 실패"),
  });

  const busy = moveMut.isPending || splitMut.isPending || mergeMut.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full rounded-xl text-xs">
          🧩 강의 구조 편집 (이동·분리·합치기)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            구조 편집 — {course.title}
          </DialogTitle>
        </DialogHeader>

        {/* 레슨 선택 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            세부 강의 선택 ({selected.length}개 선택됨)
          </p>
          {lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">세부 강의가 없어요.</p>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-white/40 p-2">
              {lessons.map((l) => (
                <li key={l.id}>
                  <label className="flex items-center gap-2 text-sm rounded-lg px-2 py-1 hover:bg-white/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.includes(l.id)}
                      onChange={() => toggle(l.id)}
                      className="size-4 rounded accent-primary"
                    />
                    <span className="truncate">
                      {l.order_index}. {l.title}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {lessons.length > 0 && (
            <button
              type="button"
              className="text-xs text-primary underline"
              onClick={() =>
                setSelected(
                  selected.length === lessons.length ? [] : lessons.map((l) => l.id),
                )
              }
            >
              {selected.length === lessons.length ? "전체 해제" : "전체 선택"}
            </button>
          )}
        </div>

        {/* ① 선택 레슨 이동 */}
        <div className="rounded-2xl border border-border bg-white/40 p-3 space-y-2">
          <p className="text-xs font-semibold">① 선택한 세부 강의를 다른 강의로 이동</p>
          <div className="flex gap-2">
            <Select value={moveTarget} onValueChange={setMoveTarget}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="이동할 강의 선택" />
              </SelectTrigger>
              <SelectContent>
                {otherCourses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title} ({c.lessons.length}개)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={busy || selected.length === 0 || !moveTarget}
              onClick={() => moveMut.mutate()}
            >
              {moveMut.isPending && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              이동
            </Button>
          </div>
        </div>

        {/* ② 선택 레슨 분리 */}
        <div className="rounded-2xl border border-border bg-white/40 p-3 space-y-2">
          <p className="text-xs font-semibold">② 선택한 세부 강의로 새 강의 만들기 (분리)</p>
          <div className="flex gap-2">
            <Input
              value={splitTitle}
              onChange={(e) => setSplitTitle(e.target.value)}
              placeholder="새 강의 제목"
              className="flex-1"
              maxLength={80}
            />
            <Button
              size="sm"
              disabled={busy || selected.length === 0 || !splitTitle.trim()}
              onClick={() => splitMut.mutate()}
            >
              {splitMut.isPending && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              분리
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            난이도는 현재 강의를 따라가요. 선택한 레슨이 새 강의로 옮겨져요.
          </p>
        </div>

        {/* ③ 강의 전체 합치기 */}
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <p className="text-xs font-semibold">③ 이 강의 전체를 다른 강의에 합치기</p>
          <div className="flex gap-2">
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="합칠 대상 강의 선택" />
              </SelectTrigger>
              <SelectContent>
                {otherCourses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title} ({c.lessons.length}개)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy || !mergeTarget}
              onClick={() => {
                const targetTitle =
                  otherCourses.find((c) => c.id === mergeTarget)?.title ?? "";
                if (
                  confirm(
                    `"${course.title}"의 모든 세부 강의를 "${targetTitle}" 뒤에 붙이고,\n"${course.title}" 강의는 삭제됩니다. 계속할까요?`,
                  )
                ) {
                  mergeMut.mutate();
                }
              }}
            >
              {mergeMut.isPending && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              합치기
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            모든 세부 강의가 대상 강의 뒤에 이어 붙고, 이 강의(빈 껍데기)는 삭제돼요.
            학습 진도 기록은 레슨을 따라 그대로 유지됩니다.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LessonListEditor({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const isEditor = useIsEditor();
  const update = useServerFn(updateLesson);
  const remove = useServerFn(deleteLesson);

  const { data } = useQuery({
    queryKey: ["sidebar-courses-with-lessons"],
    queryFn: () => listCoursesWithLessons(),
  });
  const lessons = data?.find((c) => c.id === courseId)?.lessons ?? [];

  const updateM = useMutation({
    mutationFn: (vars: { lessonId: string; title: string; description: string }) =>
      update({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sidebar-courses-with-lessons"] });
      qc.invalidateQueries({ queryKey: ["courses-with-counts"] });
    },
  });
  const deleteM = useMutation({
    mutationFn: (lessonId: string) => remove({ data: { lessonId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sidebar-courses-with-lessons"] });
      qc.invalidateQueries({ queryKey: ["courses-with-counts"] });
    },
  });

  if (lessons.length === 0) return null;

  return (
    <div className="pt-3 border-t border-white/30 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">세부 강의 목록</p>
      <ul className="space-y-1.5">
        {lessons.map((l) => (
          <LessonRow
            key={l.id}
            lesson={l}
            isEditor={isEditor}
            onSave={(title, description) =>
              updateM.mutate({ lessonId: l.id, title, description })
            }
            onDelete={() => {
              if (confirm(`"${l.title}" 세부 강의를 삭제할까요?`)) {
                deleteM.mutate(l.id);
              }
            }}
            saving={updateM.isPending}
          />
        ))}
      </ul>
      {(updateM.error || deleteM.error) && (
        <p className="text-destructive text-xs whitespace-pre-wrap">
          {((updateM.error || deleteM.error) as Error).message}
        </p>
      )}
    </div>
  );
}

function LessonRow({
  lesson,
  isEditor,
  onSave,
  onDelete,
  saving,
}: {
  lesson: CourseWithLessons["lessons"][number];
  isEditor: boolean;
  onSave: (title: string, description: string) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lesson.title);
  const [descDraft, setDescDraft] = useState(lesson.description ?? "");
  const navigate = useNavigate();

  if (editing) {
    return (
      <li className="space-y-1.5 rounded-xl bg-white/50 p-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 text-sm"
          placeholder="세부 강의 제목"
          maxLength={120}
          autoFocus
        />
        <Textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          className="min-h-14 text-sm"
          placeholder="설명 (선택) — 이 강의에서 배우는 내용을 한두 줄로"
          maxLength={300}
        />
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(lesson.title);
              setDescDraft(lesson.description ?? "");
              setEditing(false);
            }}
          >
            취소
          </Button>
          <Button
            size="sm"
            variant="default"
            disabled={saving || !draft.trim()}
            onClick={() => {
              onSave(draft.trim(), descDraft.trim());
              setEditing(false);
            }}
          >
            저장
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-2 text-sm">
      <button
        type="button"
        className="min-w-0 flex-1 text-left hover:text-primary"
        onClick={() =>
          navigate({ to: "/lessons/$id", params: { id: lesson.id } })
        }
      >
        <span className="block truncate">
          {lesson.order_index}. {lesson.title}
        </span>
        {lesson.description && (
          <span className="block truncate text-xs text-muted-foreground">
            {lesson.description}
          </span>
        )}
      </button>
      {isEditor && (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setEditing(true)}
          >
            수정
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            삭제
          </Button>
        </div>
      )}
    </li>
  );
}
