import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { AuthBridge } from "@/lib/auth-client";
import { DingDongBot } from "@/components/dingdong-bot";
import { PushManager } from "@/components/push-manager";
import { ThemeProvider } from "@/components/theme-provider";
import { VIEWPORT_CONTENT } from "@/lib/mobile-ui";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * What the error actually was, as text a person can read off a phone.
 *
 * `console.error` below is the only place this used to go, and
 * `reportLovableError` forwards to a hook that exists in the Lovable preview
 * and nowhere else — so on the deployed site a crash left no trace at all, on
 * the screen or in the server logs. Someone on a phone had no way to say more
 * than "it broke".
 */
function errorDetail(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(`${error.name}: ${error.message}`);
    if (error.stack) parts.push(error.stack);
  } else {
    parts.push(String(error));
  }
  if (typeof window !== "undefined") {
    parts.push(`at ${window.location.pathname}${window.location.search}`);
  }
  parts.push(new Date().toISOString());
  return parts.join("\n\n");
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const detail = errorDetail(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>

        <details className="mt-4 text-left">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            오류 자세히 보기
          </summary>
          <pre className="mt-2 max-h-64 select-all overflow-auto whitespace-pre-wrap break-all rounded-lg border border-input bg-muted p-3 text-left text-[11px] leading-relaxed text-foreground">
            {detail}
          </pre>
          <button
            type="button"
            onClick={() => {
              // Clipboard access is refused outside a secure context and in
              // some in-app browsers; the <pre> is select-all either way.
              navigator.clipboard
                ?.writeText(detail)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
            className="mt-2 inline-flex min-h-11 items-center justify-center rounded-md border border-input px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent md:min-h-9"
          >
            {copied ? "복사됨" : "오류 내용 복사"}
          </button>
        </details>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: VIEWPORT_CONTENT },
      { title: "dingdong lms" },
      { name: "description", content: "AI-powered Chinese learning platform for Korean adults." },
      { name: "author", content: "DingDong" },
      { property: "og:title", content: "dingdong lms" },
      {
        property: "og:description",
        content: "AI-powered Chinese learning platform for Korean adults.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "dingdong lms" },
      {
        name: "twitter:description",
        content: "AI-powered Chinese learning platform for Korean adults.",
      },
      { property: "og:image", content: "https://dingdong-production.up.railway.app/og-image.png" },
      { name: "twitter:image", content: "https://dingdong-production.up.railway.app/og-image.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/dingdong-icon-192.png" },
      { rel: "apple-touch-icon", href: "/dingdong-icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // The boot script below sets the class on this element before React
    // hydrates, which is a mismatch by definition — the server cannot know the
    // visitor's theme. Suppressing it here is what keeps that from being
    // reported as a hydration error.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Must run before the stylesheet paints, or a dark user gets a pastel
            flash on every full document load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthBridge />
      <ThemeProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <DingDongBot />
        <PushManager />
        <Toaster richColors position="top-center" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
