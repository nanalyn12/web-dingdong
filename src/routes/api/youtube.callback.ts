import { createFileRoute } from "@tanstack/react-router";

// Google redirects here after consent; stores the refresh token.
export const Route = createFileRoute("/api/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") ?? "";
        const cookieState =
          request.headers.get("cookie")?.match(/yt_oauth_state=([^;]+)/)?.[1] ?? "";
        if (!code || !state || state !== cookieState) {
          return new Response("잘못된 OAuth 응답입니다. 다시 시도해주세요.", {
            status: 400,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        const { auth } = await import("@/lib/auth.server");
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) return new Response("Unauthorized", { status: 401 });
        const { assertEditor } = await import("@/lib/courses.functions");
        await assertEditor(session.user.id);

        const { exchangeYouTubeCode } = await import("@/lib/video/youtube.server");
        await exchangeYouTubeCode(code);

        return new Response(null, {
          status: 302,
          headers: {
            Location: "/studio?youtube=connected",
            "Set-Cookie": "yt_oauth_state=; Path=/; Max-Age=0",
          },
        });
      },
    },
  },
});
