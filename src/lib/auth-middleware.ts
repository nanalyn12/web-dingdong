import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Server-function middleware: resolves the better-auth session from the
 * request cookies and exposes { userId, email, sessionUser } in context.
 */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (!request?.headers) {
    throw new Error("Unauthorized: No request headers available");
  }

  const { auth } = await import("@/lib/auth.server");
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    throw new Error("Unauthorized: Not signed in");
  }

  return next({
    context: {
      userId: session.user.id,
      email: (session.user.email ?? "").toLowerCase(),
      sessionUser: session.user,
    },
  });
});

/**
 * Like requireAuth but never throws for guests — exposes userId: null when
 * there is no session. For endpoints that work for everyone but return extra
 * data (e.g. the user's own vocabulary) when signed in.
 */
export const optionalAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  let userId: string | null = null;
  if (request?.headers) {
    try {
      const { auth } = await import("@/lib/auth.server");
      const session = await auth.api.getSession({ headers: request.headers });
      userId = session?.user?.id ?? null;
    } catch {
      userId = null;
    }
  }
  return next({ context: { userId } });
});
