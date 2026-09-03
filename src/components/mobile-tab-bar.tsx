import { Link, useRouterState } from "@tanstack/react-router";

import { isNavItemActive, tabBarItemsFor } from "@/lib/nav-items";
import { useMyProfile } from "@/lib/auth-client";

/**
 * The five learning destinations, always on screen, one tap away.
 *
 * The hamburger sheet reaches everything, but reaching 학습송 through it costs
 * two taps and a decision — which is enough friction that the sections a
 * learner uses most were effectively behind a menu. The sheet stays for the
 * dashboard, settings and the teacher screens; this is the front row.
 *
 * Phone only: from md up the sidebar is already permanently visible.
 */
export function MobileTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useMyProfile();
  const items = tabBarItemsFor(profile?.role);

  return (
    <nav
      aria-label="주요 학습 메뉴"
      className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-surface/60 md:hidden"
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.url);
          return (
            <li key={item.url} className="flex-1">
              <Link
                to={item.url}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid size-8 place-items-center rounded-full transition-colors",
                    active ? "gradient-primary text-primary-foreground" : "",
                  ].join(" ")}
                >
                  <item.icon className="size-4" />
                </span>
                <span className="w-full truncate text-center leading-none">{item.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
