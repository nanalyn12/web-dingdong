import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/reengagement-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY!;
        const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
        const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:dingdong@example.com";
        const { default: webpush } = await import("web-push");
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Inactive > 3 days
        const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: profiles, error: pErr } = await supabaseAdmin
          .from("profiles")
          .select("id, last_active_at")
          .or(`last_active_at.is.null,last_active_at.lt.${cutoff}`);
        if (pErr) {
          return Response.json({ ok: false, error: pErr.message }, { status: 500 });
        }
        if (!profiles?.length) return Response.json({ ok: true, sent: 0 });

        const userIds = profiles.map((p) => p.id);
        const { data: subs, error: sErr } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, user_id, endpoint, p256dh, auth, last_pushed_at")
          .in("user_id", userIds);
        if (sErr) {
          return Response.json({ ok: false, error: sErr.message }, { status: 500 });
        }

        let sent = 0;
        let skipped = 0;
        let failed = 0;

        const payload = JSON.stringify({
          title: "叮叮가 기다리고 있어요 🐼",
          body: "다시 공부하러 와요! 오늘도 중국어 한 입 🍡",
          url: "/",
        });

        for (const s of subs ?? []) {
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
            await supabaseAdmin
              .from("push_subscriptions")
              .update({ last_pushed_at: new Date().toISOString() })
              .eq("id", s.id);
            sent++;
          } catch (err: unknown) {
            failed++;
            const code = (err as { statusCode?: number })?.statusCode;
            if (code === 404 || code === 410) {
              await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
            }
          }
        }

        return Response.json({ ok: true, sent, skipped, failed });
      },
    },
  },
});
