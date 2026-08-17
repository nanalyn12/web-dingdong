import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { useEffect, useRef } from "react";

import { ensureProfile, getMyProfile } from "@/lib/profile.functions";
import { isEditorRole } from "@/lib/roles";

export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

type SessionData =
  ReturnType<typeof authClient.useSession> extends {
    data: infer D;
  }
    ? NonNullable<D>
    : never;

export type SessionUser = SessionData["user"];

export function useSession(): {
  session: SessionData | null;
  user: SessionUser | null;
  loading: boolean;
} {
  const { data, isPending } = authClient.useSession();
  return {
    session: data ?? null,
    user: data?.user ?? null,
    loading: isPending,
  };
}

/**
 * Listens to auth state changes globally:
 * - When a session appears: ensures a profiles row exists, applies the
 *   ADMIN_EMAILS/TEACHER_EMAILS allowlists, and bumps last_active_at.
 * - Invalidates the cached profile query.
 */
export function AuthBridge() {
  const { data } = authClient.useSession();
  const ensure = useServerFn(ensureProfile);
  const qc = useQueryClient();
  const lastUserId = useRef<string | null>(null);

  const userId = data?.user?.id ?? null;

  useEffect(() => {
    if (userId && userId !== lastUserId.current) {
      lastUserId.current = userId;
      ensure({})
        .then(() => {
          qc.invalidateQueries({ queryKey: ["my-profile"] });
        })
        .catch(() => {});
    }
    if (!userId && lastUserId.current) {
      lastUserId.current = null;
      qc.removeQueries({ queryKey: ["my-profile"] });
    }
  }, [userId, ensure, qc]);

  return null;
}

export function useMyProfile() {
  const { session } = useSession();
  const fetchProfile = useServerFn(getMyProfile);
  return useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile({}),
    enabled: !!session,
    staleTime: 60_000,
  });
}

export function useIsEditor() {
  const { data } = useMyProfile();
  return isEditorRole(data?.role);
}
