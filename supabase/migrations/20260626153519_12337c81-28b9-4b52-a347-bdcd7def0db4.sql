CREATE OR REPLACE FUNCTION public.profiles_block_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Service-role / server-side calls have no auth.uid(); allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins may change anything.
  SELECT public.has_role(auth.uid(), 'admin') INTO is_admin;
  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'role cannot be changed by user';
  END IF;
  IF NEW.teacher_status IS DISTINCT FROM OLD.teacher_status THEN
    RAISE EXCEPTION 'teacher_status cannot be changed by user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_role_change_trg ON public.profiles;
CREATE TRIGGER profiles_block_role_change_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_block_role_change();