
-- Fix 1: Prevent privilege escalation via profiles_update_own (defense-in-depth alongside existing trigger)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (
        role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
        AND teacher_status IS NOT DISTINCT FROM (SELECT p.teacher_status FROM public.profiles p WHERE p.id = auth.uid())
      )
    )
  );

-- Ensure the guard trigger is present
DROP TRIGGER IF EXISTS profiles_block_role_change ON public.profiles;
CREATE TRIGGER profiles_block_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_block_role_change();

-- Fix 2/3: Restrict EXECUTE on SECURITY DEFINER functions.
-- Trigger-only functions: revoke from everyone (triggers don't need EXECUTE grants).
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_block_role_change() FROM PUBLIC, anon, authenticated;

-- Role-check helpers: revoke from PUBLIC/anon; keep authenticated (required by RLS policies).
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_editor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_editor(uuid) TO authenticated;
