import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/reengagement-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Shared-secret auth for the external cron caller.
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.CRON_HOOK_SECRET ?? "";
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY!;
        const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
        const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:dingdong@example.com";
        const { default: webpush } = await import("web-push");
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        const { db, tables } = await import("@/db");
        const { eq, inArray, isNull, lt, or } = await import("drizzle-orm");

        // Inactive > 3 days
        const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const profiles = await db
          .select({
            id: tables.profiles.id,
            last_active_at: tables.profiles.last_active_at,
          })
          .from(tables.profiles)
          .where(
            or(isNull(tables.profiles.last_active_at), lt(tables.profiles.last_active_at, cutoff)),
          );
        if (!profiles.length) return Response.json({ ok: true, sent: 0 });

        const userIds = profiles.map((p) => p.id);
        const subs = await db
          .select({
            id: tables.push_subscriptions.id,
            user_id: tables.push_subscriptions.user_id,
            endpoint: tables.push_subscriptions.endpoint,
            p256dh: tables.push_subscriptions.p256dh,
            auth: tables.push_subscriptions.auth,
            last_pushed_at: tables.push_subscriptions.last_pushed_at,
          })
          .from(tables.push_subscriptions)
          .where(inArray(tables.push_subscriptions.user_id, userIds));

        let sent = 0;
        let skipped = 0;
        let failed = 0;

        const payload = JSON.stringify({
          title: "叮叮가 기다리고 있어요 🐼",
          body: "다시 공부하러 와요! 오늘도 중국어 한 입 🍡",
          url: "/",
        });

        for (const s of subs) {
          if (s.last_pushed_at && s.last_pushed_at > oneDayAgo) {
            skipped++;
            continue;
          }
          try {
            await webpush.sendNotification(
              {
                endpoint: s.endpoint,
                keys: { p256dh: s.p256dh, auth: s.auth },
              },
              payload,
            );
            await db
              .update(tables.push_subscriptions)
              .set({ last_pushed_at: new Date().toISOString() })
              .where(eq(tables.push_subscriptions.id, s.id));
            sent++;
          } catch (err: unknown) {
            failed++;
            const code = (err as { statusCode?: number })?.statusCode;
            if (code === 404 || code === 410) {
              await db
                .delete(tables.push_subscriptions)
                .where(eq(tables.push_subscriptions.id, s.id));
            }
          }
        }

        return Response.json({ ok: true, sent, skipped, failed });
      },
    },
  },
});
