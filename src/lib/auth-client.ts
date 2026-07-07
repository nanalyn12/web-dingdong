import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { ensureProfile, getMyProfile } from "@/lib/profile.functions";

export function useSession(): { session: Session | null; user: User | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

/**
 * Listens to auth state changes globally:
 * - On SIGNED_IN: ensures a profiles row exists, applies TEACHER_EMAILS allowlist,
 *   and bumps last_active_at.
 * - Invalidates the cached profile query.
 */
export function AuthBridge() {
  const ensure = useServerFn(ensureProfile);
  const qc = useQueryClient();

  useEffect(() => {
    // Run once on mount in case the user is already signed in.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        ensure({}).catch(() => {});
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        ensure({}).then(() => {
          qc.invalidateQueries({ queryKey: ["my-profile"] });
        }).catch(() => {});
      }
      if (event === "SIGNED_OUT") {
        qc.removeQueries({ queryKey: ["my-profile"] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [ensure, qc]);

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
  return data?.role === "teacher" || data?.role === "admin";
}
