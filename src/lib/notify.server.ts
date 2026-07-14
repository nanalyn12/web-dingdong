// Web-push notifications to admin accounts. SERVER-ONLY, best-effort.
import { eq, inArray } from "drizzle-orm";

import { db, tables } from "@/db";

export async function notifyAdmins(
  title: string,
  body: string,
  url = "/studio",
): Promise<void> {
  try {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return;

    const admins = await db
      .select({ id: tables.profiles.id })
      .from(tables.profiles)
      .where(eq(tables.profiles.role, "admin"));
    if (admins.length === 0) return;

    const subs = await db
      .select()
      .from(tables.push_subscriptions)
      .where(
        inArray(
          tables.push_subscriptions.user_id,
          admins.map((a) => a.id),
        ),
      );
    if (subs.length === 0) return;

    const { default: webpush } = await import("web-push");
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:dingdong@example.com",
      pub,
      priv,
    );
    const payload = JSON.stringify({ title, body: body.slice(0, 160), url });
    await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        ),
      ),
    );
  } catch (e) {
    console.warn("[notify] admin push failed:", e);
  }
}
