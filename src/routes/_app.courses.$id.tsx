import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Check, GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { listCoursesWithCounts, listCoursesWithLessons } from "@/lib/courses.functions";
import { listMyLessonProgress } from "@/lib/lesson-progress.functions";
import { LEVEL_TONE, levelLabelHsk } from "@/lib/levels";

export const Route = createFileRoute("/_app/courses/$id")({
  head: () => ({
    meta: [{ title: "강의 — DingDong" }],
  }),
  component: CourseDetail,
});

const LEVEL_PILL: Record<string, string> = {
  beginner: `bg-level-beginner/15 ${LEVEL_TONE.beginner}`,
  intermediate: `bg-level-intermediate/15 ${LEVEL_TONE.intermediate}`,
  advanced: `bg-level-advanced/15 ${LEVEL_TONE.advanced}`,
};

function CourseDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { session } = useSession();

  // Both lists are already in cache — the sidebar and the course grid fetch
  // them on every page — so the detail view costs no extra request.
  const { data: courses, isLoading: loadingCourses } = useQuery({
    queryKey: ["courses-with-counts"],
    queryFn: () => listCoursesWithCounts(),
  });
  const { data: withLessons, isLoading: loadingLessons } = useQuery({
    queryKey: ["sidebar-courses-with-lessons"],
    queryFn: () => listCoursesWithLessons(),
  });
  const { data: progressList } = useQuery({
    queryKey: ["my-lesson-progress"],
    queryFn: () => listMyLessonProgress(),
    enabled: !!session,
  });

  const course = courses?.find((c) => c.id === id);
  const lessons = withLessons?.find((c) => c.id === id)?.lessons ?? [];
  const progress = new Map((progressList ?? []).map((p) => [p.lesson_id, p]));
  const doneCount = lessons.filter((l) => progress.get(l.id)?.completed).length;

  // The reader resumes at the first lesson they have not finished, so the CTA
  // does not send them back to lesson 1 every time.
  const nextLesson = lessons.find((l) => !progress.get(l.id)?.completed) ?? lessons[0];

  if (loadingCourses || loadingLessons) {
    return (
      <div className="glass rounded-3xl p-5 sm:p-8 text-center text-muted-foreground">
        불러오는 중…
      </div>
    );
  }

  if (!course) {
    return (
      <div className="glass rounded-3xl p-10 text-center space-y-3">
        <div className="text-4xl">🔍</div>
        <p className="font-medium">강의를 찾을 수 없어요.</p>
        <Button variant="outline" onClick={() => navigate({ to: "/courses" })}>
          강의 목록으로
        </Button>
      </div>
    );
  }

  const level = course.level ?? "beginner";

  return (
    <div className="space-y-5">
      <Link
        to="/courses"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground md:min-h-0"
      >
        <ArrowLeft className="size-4" /> 강의 목록
      </Link>

      <header className="glass rounded-3xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              LEVEL_PILL[level] ?? LEVEL_PILL.beginner
            }`}
          >
            {levelLabelHsk(level)}
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/50">
            {course.weeks}주차 과정
          </span>
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <GraduationCap className="size-7 text-primary shrink-0" />
            {course.title}
          </h1>
          {course.description && (
            <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          세부 강의 {lessons.length}개{session && lessons.length > 0 && ` · ${doneCount}개 완료`}
        </p>
        {nextLesson && (
          <Button
            className="rounded-2xl"
            onClick={() => navigate({ to: "/lessons/$id", params: { id: nextLesson.id } })}
          >
            {doneCount > 0 ? "이어서 학습 →" : "학습 시작 →"}
          </Button>
        )}
      </header>

      <section className="glass rounded-3xl p-4 sm:p-5">
        <h2 className="px-1 pb-2 text-sm font-semibold text-muted-foreground">세부 강의 목록</h2>
        {lessons.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            아직 세부 강의가 준비되지 않았어요.
          </p>
        ) : (
          <ol className="flex flex-col gap-1">
            {lessons.map((l, i) => {
              const p = progress.get(l.id);
              return (
                <li key={l.id}>
                  <Link
                    to="/lessons/$id"
                    params={{ id: l.id }}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/60 text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.title}</span>
                      {l.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {l.description}
                        </span>
                      )}
                    </span>
                    {p?.completed ? (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-success">
                        <Check className="size-3.5" /> 완료
                      </span>
                    ) : p ? (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <BookOpen className="size-3.5" /> 학습 중
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
