import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HelpCircle, Menu, Sparkles } from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { useMyProfile } from "@/lib/auth-client";

/**
 * Navigation for phones. The sidebar is `hidden md:flex`, so without this a
 * 375px screen has no links at all — the learning sections were reachable only
 * by going through the home page, and the teacher screens not at all.
 *
 * The trigger replaces the wordmark rather than joining it: four items in the
 * header row squeezed the search field down to a single visible character.
 * Home is the first row of the sheet instead.
 */
export function MobileNav({ onOpenHelp }: { onOpenHelp: () => void }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useMyProfile();

  // A tap on a link navigates and the sheet must get out of the way. Closing
  // on pathname change also covers back/forward and any programmatic navigation.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="메뉴 열기"
        className="md:hidden inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface/60 border border-border hover:bg-surface transition"
      >
        <Menu className="size-5" />
      </SheetTrigger>

      <SheetContent
        side="left"
        className="flex flex-col w-72 max-w-[85vw] glass border-surface/60 p-4"
      >
        <SheetTitle asChild>
          <Link
            to="/"
            className="flex items-center gap-2 rounded-2xl px-1 py-2"
            aria-label="DingDong 홈으로"
          >
            <div className="size-9 rounded-2xl gradient-primary grid place-items-center text-primary-foreground">
              <Sparkles className="size-5" />
            </div>
            <div className="text-left">
              <div className="font-bold leading-tight">DingDong</div>
              <div className="text-xs font-normal text-muted-foreground">중국어 학습</div>
            </div>
          </Link>
        </SheetTitle>

        <nav className="mt-3 flex flex-col gap-1 overflow-y-auto">
          <NavLinks role={profile?.role} pathname={pathname} onNavigate={() => setOpen(false)} />
        </nav>

        {/* The header's help button is hidden on phones to leave the search
            field room, so the tour is reachable from here. */}
        <button
          onClick={() => {
            setOpen(false);
            onOpenHelp();
          }}
          className="mt-2 flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground/80 hover:bg-surface/40 transition-all"
        >
          <HelpCircle className="size-4 shrink-0" />
          <span>이 페이지 둘러보기</span>
        </button>

        {/* Guests never reach /settings, so this is their only way to the
            theme. mt-auto pins it to the bottom of the sheet. */}
        <ThemeToggle className="mt-auto" />
      </SheetContent>
    </Sheet>
  );
}
