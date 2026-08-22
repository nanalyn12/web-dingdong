import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { HelpCircle, LogIn, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "./app-sidebar";
import { HeaderSearch } from "./header-search";
import { MobileNav } from "./mobile-nav";
import { MobileTabBar } from "./mobile-tab-bar";
import { authClient, useMyProfile, useSession } from "@/lib/auth-client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resetTour, runTour, type TourName } from "@/lib/coachmark";
import {
  landingTourSteps,
  sidebarTourSteps,
  coursesTourSteps,
  dingdongTourSteps,
} from "@/lib/tour-steps";

export function AppShell({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const { data: profile } = useMyProfile();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function logout() {
    await authClient.signOut();
    toast.success("로그아웃 했어요.");
    navigate({ to: "/" });
  }

  // Auto-run the sidebar tour once. runTour() decides whether the viewport is
  // wide enough — see coachmark-visibility.ts.
  useEffect(() => {
    const t = setTimeout(() => runTour("sidebar", sidebarTourSteps()), 1200);
    return () => clearTimeout(t);
  }, []);

  function startTourForRoute(force = true) {
    if (pathname === "/") runTour("landing", landingTourSteps(), { force });
    else if (pathname.startsWith("/courses")) runTour("courses", coursesTourSteps(), { force });
    else runTour("sidebar", sidebarTourSteps(), { force });
  }

  function restartAll() {
    (["landing", "sidebar", "courses", "dingdong"] as TourName[]).forEach(resetTour);
    startTourForRoute(true);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* pt-safe sits on its own element: it sets padding-top outright, so
          stacking it on the px-4 pt-4 row would replace that padding rather
          than add to it. */}
      <header className="sticky top-0 z-40 pt-safe">
        <div className="glass mx-3 mt-3 sm:mx-4 sm:mt-4 rounded-3xl px-4 py-2.5 flex items-center gap-3">
          <MobileNav onOpenHelp={() => startTourForRoute(true)} />
          <HeaderSearch />

          <Popover>
            <PopoverTrigger asChild>
              <button
                // Hidden on a phone: four items in one 375px row squeezed the
                // search field down to a single visible character. The tour is
                // reachable from the nav instead.
                className="hidden sm:inline-flex items-center gap-1.5 rounded-2xl bg-white/60 border border-border px-3 py-2 text-sm hover:bg-white transition"
                title="둘러보기 다시 보기"
                data-tour="help-button"
              >
                <HelpCircle className="size-4" />
                <span className="hidden sm:inline">도움말</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 glass rounded-2xl border-white/60 p-2">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                코치마크 둘러보기
              </div>
              <button
                onClick={() => startTourForRoute(true)}
                className="w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-white/60 transition"
              >
                🧭 이 페이지 둘러보기
              </button>
              <button
                onClick={() => runTour("sidebar", sidebarTourSteps(), { force: true })}
                className="w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-white/60 transition"
              >
                📚 사이드바 둘러보기
              </button>
              <button
                onClick={() => runTour("dingdong", dingdongTourSteps(), { force: true })}
                className="w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-white/60 transition"
              >
                🐼 叮叮 둘러보기
              </button>
              <div className="my-1 h-px bg-white/50" />
              <button
                onClick={restartAll}
                className="w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-white/60 transition text-primary font-semibold"
              >
                🔁 전체 다시 보기
              </button>
            </PopoverContent>
          </Popover>

          {session ? (
            <div className="flex items-center gap-2">
              <Link
                to="/onboarding"
                className="hidden sm:inline-flex items-center gap-2 rounded-2xl bg-white/60 border border-border px-3 py-2 text-sm hover:bg-white transition"
                title="프로필"
              >
                <UserRound className="size-4" />
                <span className="font-medium">
                  {profile?.nickname || profile?.real_name || session.user.email}
                </span>
                {profile?.role && (
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide",
                      profile.role === "admin"
                        ? "bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white shadow-sm"
                        : profile.role === "teacher"
                          ? "bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-sm"
                          : "bg-primary/10 text-primary",
                    ].join(" ")}
                    title={`role=${profile.role}`}
                  >
                    {profile.role === "admin"
                      ? "👑 관리자"
                      : profile.role === "teacher"
                        ? "🎓 교수자"
                        : "🌱 학생"}
                  </span>
                )}
              </Link>
              <button
                onClick={logout}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white/60 border border-border px-3 py-2 text-sm transition hover:bg-white md:min-h-0"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">로그아웃</span>
              </button>
            </div>
          ) : (
            // shrink-0 + nowrap: in the flex header the search box would
            // otherwise squeeze this down until "로그인" wrapped one character
            // per line on narrow phones.
            <Link
              to="/auth"
              className="shrink-0 whitespace-nowrap inline-flex min-h-11 items-center gap-2 rounded-2xl gradient-primary text-primary-foreground px-3 sm:px-4 py-2 text-sm font-medium shadow-[var(--shadow-soft)] transition hover:opacity-90 md:min-h-0"
            >
              <LogIn className="size-4" />
              로그인
            </Link>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        <AppSidebar />
        {/* min-w-0: without it this flex item refuses to shrink below its
            content's min-content width, so one wide child scrolls the whole
            page sideways on a phone instead of being contained. */}
        {/* The tab bar is fixed, so the page has to end above it or the last
            row of every screen sits underneath. */}
        <main className="min-w-0 flex-1 p-3 pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom,0px)+0.75rem)] sm:p-4 md:pb-4 md:pl-0">
          {children}
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
