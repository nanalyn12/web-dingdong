-- 1) Ownership columns
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS courses_created_by_idx ON public.courses(created_by);
CREATE INDEX IF NOT EXISTS lessons_created_by_idx ON public.lessons(created_by);

-- 2) Admin helper
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'admin'
  )
$$;

-- 3) Replace policies on courses
DROP POLICY IF EXISTS courses_insert_editor ON public.courses;
DROP POLICY IF EXISTS courses_update_editor ON public.courses;
DROP POLICY IF EXISTS courses_delete_editor ON public.courses;

CREATE POLICY courses_insert_editor ON public.courses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_editor(auth.uid())
    AND (created_by = auth.uid() OR public.is_admin(auth.uid()))
  );

CREATE POLICY courses_update_owner_or_admin ON public.courses
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY courses_delete_owner_or_admin ON public.courses
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

-- 4) Replace policies on lessons
DROP POLICY IF EXISTS lessons_insert_editor ON public.lessons;
DROP POLICY IF EXISTS lessons_update_editor ON public.lessons;
DROP POLICY IF EXISTS lessons_delete_editor ON public.lessons;

CREATE POLICY lessons_insert_editor ON public.lessons
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_editor(auth.uid())
    AND (created_by = auth.uid() OR public.is_admin(auth.uid()))
  );

CREATE POLICY lessons_update_owner_or_admin ON public.lessons
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY lessons_delete_owner_or_admin ON public.lessons
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

-- 5) Wipe existing test data
DELETE FROM public.lessons;
DELETE FROM public.courses;