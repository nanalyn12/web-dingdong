import { createFileRoute } from "@tanstack/react-router";

// Starts the YouTube OAuth consent flow (editor only).
export const Route = createFileRoute("/api/youtube/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { auth } = await import("@/lib/auth.server");
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) return new Response("Unauthorized", { status: 401 });
        const { assertEditor } = await import("@/lib/courses.functions");
        await assertEditor(session.user.id);

        const { youtubeConsentUrl } = await import("@/lib/video/youtube.server");
        const state = crypto.randomUUID();
        return new Response(null, {
          status: 302,
          headers: {
            Location: youtubeConsentUrl(state),
            "Set-Cookie": `yt_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
          },
        });
      },
    },
  },
});
