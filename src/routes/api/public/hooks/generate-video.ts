import { createFileRoute } from "@tanstack/react-router";

// Cron/scheduler entry point: creates a video job without a browser session.
// Auth: shared secret header (same pattern as reengagement-push).
// Body: partial VideoJobConfig — sensible defaults fill the rest.
export const Route = createFileRoute("/api/public/hooks/generate-video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.CRON_HOOK_SECRET ?? "";
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }
        if (!body.keyword) {
          return Response.json(
            { ok: false, error: "keyword is required" },
            { status: 400 },
          );
        }

        const { db, tables } = await import("@/db");
        const { eq } = await import("drizzle-orm");

        // Jobs created by cron are attributed to the first admin.
        const admins = await db
          .select({ id: tables.profiles.id })
          .from(tables.profiles)
          .where(eq(tables.profiles.role, "admin"))
          .limit(1);
        if (!admins[0]) {
          return Response.json({ ok: false, error: "no admin user" }, { status: 500 });
        }

        const config = {
          keyword: String(body.keyword),
          topic: String(body.topic ?? ""),
          audience: String(body.audience ?? "중국어 입문 성인 학습자"),
          lengthSeconds: Number(body.lengthSeconds ?? 60),
          language: (body.language as string) === "zh" ? "zh" : "ko",
          focus: ["culture", "grammar", "entertainment", "daily"].includes(
            String(body.focus),
          )
            ? body.focus
            : "culture",
          resolution:
            String(body.resolution) === "1920x1080" ? "1920x1080" : "1280x720",
          clipCount: Math.min(20, Math.max(3, Number(body.clipCount ?? 6))),
          voice: String(body.voice ?? "ko-KR-Neural2-A"),
          burnSubtitles: body.burnSubtitles !== false,
          uploadMode: ["auto", "web"].includes(String(body.uploadMode))
            ? body.uploadMode
            : "approval",
          privacy: ["private", "unlisted", "public"].includes(String(body.privacy))
            ? body.privacy
            : "private",
          courseId: typeof body.courseId === "string" ? body.courseId : null,
          newCourseTitle:
            typeof body.newCourseTitle === "string" ? body.newCourseTitle : undefined,
        };

        const [row] = await db
          .insert(tables.video_jobs)
          .values({
            created_by: admins[0].id,
            config: config as unknown as import("@/db/schema").Json,
          })
          .returning({ id: tables.video_jobs.id });

        const { kickVideoWorker } = await import("@/lib/video/pipeline.server");
        kickVideoWorker();

        return Response.json({ ok: true, jobId: row.id });
      },
    },
  },
});
