import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronLeft, ChevronRight, List } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { listCoursesWithLessons } from "@/lib/courses.functions";
import { listMyLessonProgress } from "@/lib/lesson-progress.functions";

/** Course context for a lesson being read: which course it belongs to, where
 * it sits in the sequence, and the sibling list.
 *
 * The sidebar carries the same list but is `hidden md:flex`, so on a phone a
 * reader who opened a lesson had no way to see the rest of the course or move
 * to the next one without going back to /courses. */
export function CourseLessonNav({ lessonId }: { lessonId: string }) {
  const navigate = useNavigate();
  const { session } = useSession();
  const [open, setOpen] = useState(false);

  // Same query key as the sidebar, so this is served from cache.
  const { data: courses } = useQuery({
    queryKey: ["sidebar-courses-with-lessons"],
    queryFn: () => listCoursesWithLessons(),
  });
  const { data: progressList } = useQuery({
    queryKey: ["my-lesson-progress"],
    queryFn: () => listMyLessonProgress(),
    enabled: !!session,
  });

  const course = courses?.find((c) => c.lessons.some((l) => l.id === lessonId));
  if (!course) return null;

  const index = course.lessons.findIndex((l) => l.id === lessonId);
  const prev = index > 0 ? course.lessons[index - 1] : null;
  const next =
    index >= 0 && index < course.lessons.length - 1
      ? course.lessons[index + 1]
      : null;
  const done = new Set(
    (progressList ?? []).filter((p) => p.completed).map((p) => p.lesson_id),
  );

  return (
    <nav className="rounded-2xl border border-border/60 bg-accent/30">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-left transition-colors hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-expanded={open}
        >
          <List className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{course.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {index + 1}/{course.lessons.length}
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            disabled={!prev}
            title={prev ? prev.title : "첫 강의예요"}
            onClick={() =>
              prev && navigate({ to: "/lessons/$id", params: { id: prev.id } })
            }
          >
            <ChevronLeft className="size-4" />
            <span className="sr-only">이전 강의</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            disabled={!next}
            title={next ? next.title : "마지막 강의예요"}
            onClick={() =>
              next && navigate({ to: "/lessons/$id", params: { id: next.id } })
            }
          >
            <ChevronRight className="size-4" />
            <span className="sr-only">다음 강의</span>
          </Button>
        </div>
      </div>

      {open && (
        <ol className="max-h-72 overflow-y-auto border-t border-border/60 px-2 py-2">
          {course.lessons.map((l, i) => {
            const active = l.id === lessonId;
            return (
              <li key={l.id}>
                <Link
                  to="/lessons/$id"
                  params={{ id: l.id }}
                  onClick={() => setOpen(false)}
                  className={[
                    "flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    active
                      ? "gradient-primary text-primary-foreground font-semibold"
                      : "hover:bg-white/60",
                  ].join(" ")}
                >
                  <span className="w-5 shrink-0 text-right opacity-70">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                  {done.has(l.id) && !active && (
                    <Check className="size-3.5 shrink-0 text-emerald-600" />
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
        <Link
          to="/courses/$id"
          params={{ id: course.id }}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          강의 전체 보기
        </Link>
        {next && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-xl text-xs"
            onClick={() => navigate({ to: "/lessons/$id", params: { id: next.id } })}
          >
            다음 강의 →
          </Button>
        )}
      </div>
    </nav>
  );
}
