import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Lazy one-time start of the video schedule ticker (needs DB env,
      // so we start it on the first request rather than at module load).
      if (!globalThis.__videoSchedulerStarted) {
        import("@/lib/video/scheduler.server")
          .then((m) => m.initVideoScheduler())
          .catch((e) => console.error("[scheduler] init failed:", e));
      }
      if (!globalThis.__supabaseMediaMigrationStarted) {
        import("@/lib/media-migration.server")
          .then((m) => m.migrateSupabaseMedia().then(() => m.cleanupOrphanVideoFiles()))
          .catch((e) => console.error("[media-migration] failed:", e));
      }
      if (!globalThis.__dailyBackupBootChecked) {
        import("@/lib/backup.server")
          .then((m) => m.initBackupOnBoot())
          .catch((e) => console.error("[backup] boot check failed:", e));
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
