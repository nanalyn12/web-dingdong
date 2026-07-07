-- Remove duplicate trigger on public.profiles. Keep one canonical name.
DROP TRIGGER IF EXISTS profiles_block_role_change_trg ON public.profiles;

-- Make sure the canonical trigger exists exactly once (idempotent).
DROP TRIGGER IF EXISTS profiles_block_role_change ON public.profiles;
CREATE TRIGGER profiles_block_role_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_block_role_change();

-- updated_at trigger: ensure single instance as well.
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();