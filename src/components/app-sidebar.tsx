import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarClock, ChevronRight, Clapperboard, Film, GraduationCap, Home, LayoutDashboard, Music, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useState } from "react";

import { listCoursesWithLessons } from "@/lib/courses.functions";
import { useIsEditor, useMyProfile } from "@/lib/auth-client";
import { WidgetPanel } from "@/components/widget-panel";

const items = [
  { title: "홈", url: "/", icon: Home },
  { title: "대시보드", url: "/dashboard", icon: LayoutDashboard },
  { title: "강의", url: "/courses", icon: GraduationCap },
  { title: "영상 학습", url: "/dramas", icon: Film },
  { title: "학습송", url: "/songs", icon: Music },
  { title: "단어장", url: "/vocabulary", icon: BookOpen },
];


export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useMyProfile();
  const isAdmin = profile?.role === "admin";
  const isEditor = useIsEditor();

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
        {items.map((item) => {
          const active =
            item.url === "/"
              ? pathname === "/"
              : pathname.startsWith(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              data-tour={`nav-${item.url.replace("/", "") || "home"}`}

              className={[
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "gradient-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                  : "text-foreground/80 hover:bg-white/40",
              ].join(" ")}
            >
              <item.icon className="size-4" />
              <span>{item.title}</span>
            </Link>
          );
        })}
        {isEditor && (
          <Link
            to="/students"
            className={[
              "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all",
              pathname.startsWith("/students")
                ? "gradient-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                : "text-foreground/80 hover:bg-white/40",
            ].join(" ")}
          >
            <Users className="size-4" />
            <span>학생 현황</span>
          </Link>
        )}
        {isEditor && (
          <Link
            to="/curriculum"
            className={[
              "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all",
              pathname.startsWith("/curriculum")
                ? "gradient-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                : "text-foreground/80 hover:bg-white/40",
            ].join(" ")}
          >
            <CalendarClock className="size-4" />
            <span>커리큘럼 생성기</span>
          </Link>
        )}
        {isEditor && (
          <Link
            to="/studio"
            className={[
              "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all",
              pathname.startsWith("/studio")
                ? "gradient-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                : "text-foreground/80 hover:bg-white/40",
            ].join(" ")}
          >
            <Clapperboard className="size-4" />
            <span>영상 스튜디오</span>
          </Link>
        )}
        {isAdmin && (
          <Link
            to="/admin"
            className={[
              "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all",
              pathname.startsWith("/admin")
                ? "gradient-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                : "text-foreground/80 hover:bg-white/40",
            ].join(" ")}
          >
            <ShieldCheck className="size-4" />
            <span>관리자</span>
          </Link>
        )}
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
    <div className="glass rounded-3xl p-3 flex flex-col gap-1 overflow-hidden" data-tour="sidebar-lessons">
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
        세부 강의 목록
      </div>
      {isLoading && (
        <div className="px-2 py-1 text-xs text-muted-foreground">불러오는 중…</div>
      )}
      {data && data.length === 0 && (
        <div className="px-2 py-1 text-xs text-muted-foreground">
          아직 강의가 없습니다.
        </div>
      )}
      <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto pr-1">
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
        <ChevronRight
          className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="truncate font-medium">{course.title}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {course.lessons.length}
        </span>
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

