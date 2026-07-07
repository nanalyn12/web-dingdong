import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
});

const SubInput = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  user_agent: z.string().optional().nullable(),
});

export const saveSubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => SubInput.parse(d))
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const values = {
      user_id: context.userId,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      user_agent: data.user_agent ?? null,
    };
    await db
      .insert(tables.push_subscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: tables.push_subscriptions.endpoint,
        set: values,
      });
    return { ok: true };
  });

export const deleteSubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ endpoint: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    await db
      .delete(tables.push_subscriptions)
      .where(
        and(
          eq(tables.push_subscriptions.endpoint, data.endpoint),
          eq(tables.push_subscriptions.user_id, context.userId),
        ),
      );
    return { ok: true };
  });

export const mySubscriptionStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({ endpoint: tables.push_subscriptions.endpoint })
      .from(tables.push_subscriptions)
      .where(eq(tables.push_subscriptions.user_id, context.userId))
      .limit(1);
    return { hasSubscription: rows.length > 0 };
  });
