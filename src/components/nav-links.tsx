import { Link } from "@tanstack/react-router";

import { isNavItemActive, navItemsFor } from "@/lib/nav-items";

/**
 * The menu rows. Both surfaces render this — the desktop sidebar and the
 * mobile sheet — so an item added to `navItemsFor` shows up in both without
 * anyone remembering to.
 */
export function NavLinks({
  role,
  pathname,
  onNavigate,
}: {
  role: string | null | undefined;
  pathname: string;
  /** The sheet closes itself on tap; the sidebar passes nothing. */
  onNavigate?: () => void;
}) {
  return (
    <>
      {navItemsFor(role).map((item) => {
        const active = isNavItemActive(pathname, item.url);
        return (
          <Link
            key={item.url}
            to={item.url}
            data-tour={item.tour}
            onClick={onNavigate}
            className={[
              "flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all md:min-h-0",
              active
                ? "gradient-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                : "text-foreground/80 hover:bg-surface/40",
            ].join(" ")}
          >
            <item.icon className="size-4 shrink-0" />
            <span>{item.title}</span>
          </Link>
        );
      })}
    </>
  );
}
