import { createFileRoute } from "@tanstack/react-router";

async function handler({ request }: { request: Request }) {
  const { auth } = await import("@/lib/auth.server");
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
