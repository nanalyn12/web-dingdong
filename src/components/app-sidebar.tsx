import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";

import { listCoursesWithLessons } from "@/lib/courses.functions";
import { useMyProfile } from "@/lib/auth-client";
import { WidgetPanel } from "@/components/widget-panel";
import { NavLinks } from "@/components/nav-links";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useMyProfile();

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col gap-2 p-4" data-tour="sidebar">
      <Link
        to="/"
        aria-label="DingDong 홈으로"
        className="glass rounded-3xl p-4 flex items-center gap-2 hover:bg-white/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        data-tour="sidebar-logo"
      >
        <div className="size-9 rounded-2xl gradient-primary grid place-items-center text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <div>
          <div className="font-bold leading-tight">DingDong</div>
          <div className="text-xs text-muted-foreground">중국어 학습</div>
        </div>
      </Link>

      <nav className="glass rounded-3xl p-2 flex flex-col gap-1" data-tour="sidebar-nav">
        <NavLinks role={profile?.role} pathname={pathname} />
      </nav>

      <WidgetPanel />

      <LessonList pathname={pathname} />
    </aside>
  );
}

function LessonList({ pathname }: { pathname: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["sidebar-courses-with-lessons"],
    queryFn: () => listCoursesWithLessons(),
  });

  return (
    <div
      className="glass rounded-3xl p-3 flex flex-col gap-1 overflow-hidden"
      data-tour="sidebar-lessons"
    >
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">세부 강의 목록</div>
      {isLoading && <div className="px-2 py-1 text-xs text-muted-foreground">불러오는 중…</div>}
      {data && data.length === 0 && (
        <div className="px-2 py-1 text-xs text-muted-foreground">아직 강의가 없습니다.</div>
      )}
      <div className="flex flex-col gap-1 max-h-[50dvh] overflow-y-auto pr-1">
        {data?.map((c) => (
          <CourseNode
            key={c.id}
            course={c}
            pathname={pathname}
            defaultOpen={c.lessons.some((l) => pathname === `/lessons/${l.id}`)}
          />
        ))}
      </div>
    </div>
  );
}

function CourseNode({
  course,
  pathname,
  defaultOpen,
}: {
  course: { id: string; title: string; lessons: { id: string; title: string }[] };
  pathname: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-left cursor-pointer transition-colors hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
      >
        <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="truncate font-medium">{course.title}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{course.lessons.length}</span>
      </button>
      {open && (
        <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-white/40 pl-2">
          {course.lessons.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">비어 있음</div>
          )}
          {course.lessons.map((l) => {
            const active = pathname === `/lessons/${l.id}`;
            return (
              <Link
                key={l.id}
                to="/lessons/$id"
                params={{ id: l.id }}
                className={[
                  "group relative block truncate rounded-lg px-2 py-1 text-xs cursor-pointer transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                  active
                    ? "gradient-primary text-primary-foreground pl-3 shadow-[var(--shadow-soft)]"
                    : "text-foreground/75 hover:bg-white/50 hover:translate-x-0.5 active:scale-[0.98]",
                ].join(" ")}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary-foreground/80"
                  />
                )}
                {l.title}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
