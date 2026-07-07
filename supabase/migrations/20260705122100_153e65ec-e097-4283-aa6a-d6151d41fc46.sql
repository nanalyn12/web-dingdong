
-- Create private schema not exposed via PostgREST
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Recreate helpers in private schema
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'admin')
$$;

CREATE OR REPLACE FUNCTION private.is_editor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role IN ('teacher','admin'))
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_editor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_editor(uuid) TO authenticated, service_role;

-- profiles
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin ON public.profiles FOR SELECT
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    (auth.uid() = id) AND (
      private.has_role(auth.uid(), 'admin')
      OR (
        (role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()))
        AND (NOT (teacher_status IS DISTINCT FROM (SELECT p.teacher_status FROM public.profiles p WHERE p.id = auth.uid())))
      )
    )
  );

-- songs
DROP POLICY IF EXISTS "editors can insert songs" ON public.songs;
CREATE POLICY "editors can insert songs" ON public.songs FOR INSERT
  WITH CHECK (private.is_editor(auth.uid()));
DROP POLICY IF EXISTS "editors can update songs" ON public.songs;
CREATE POLICY "editors can update songs" ON public.songs FOR UPDATE
  USING (private.is_editor(auth.uid())) WITH CHECK (private.is_editor(auth.uid()));
DROP POLICY IF EXISTS "editors can delete songs" ON public.songs;
CREATE POLICY "editors can delete songs" ON public.songs FOR DELETE
  USING (private.is_editor(auth.uid()));

-- courses
DROP POLICY IF EXISTS courses_insert_editor ON public.courses;
CREATE POLICY courses_insert_editor ON public.courses FOR INSERT
  WITH CHECK (private.is_editor(auth.uid()) AND (created_by = auth.uid() OR private.is_admin(auth.uid())));
DROP POLICY IF EXISTS courses_update_owner_or_admin ON public.courses;
CREATE POLICY courses_update_owner_or_admin ON public.courses FOR UPDATE
  USING (created_by = auth.uid() OR private.is_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR private.is_admin(auth.uid()));
DROP POLICY IF EXISTS courses_delete_owner_or_admin ON public.courses;
CREATE POLICY courses_delete_owner_or_admin ON public.courses FOR DELETE
  USING (created_by = auth.uid() OR private.is_admin(auth.uid()));

-- lessons
DROP POLICY IF EXISTS lessons_insert_editor ON public.lessons;
CREATE POLICY lessons_insert_editor ON public.lessons FOR INSERT
  WITH CHECK (private.is_editor(auth.uid()) AND (created_by = auth.uid() OR private.is_admin(auth.uid())));
DROP POLICY IF EXISTS lessons_update_owner_or_admin ON public.lessons;
CREATE POLICY lessons_update_owner_or_admin ON public.lessons FOR UPDATE
  USING (created_by = auth.uid() OR private.is_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR private.is_admin(auth.uid()));
DROP POLICY IF EXISTS lessons_delete_owner_or_admin ON public.lessons;
CREATE POLICY lessons_delete_owner_or_admin ON public.lessons FOR DELETE
  USING (created_by = auth.uid() OR private.is_admin(auth.uid()));

-- dramas
DROP POLICY IF EXISTS "dramas editor insert" ON public.dramas;
CREATE POLICY "dramas editor insert" ON public.dramas FOR INSERT
  WITH CHECK (private.is_editor(auth.uid()) AND created_by = auth.uid());
DROP POLICY IF EXISTS "dramas owner or admin update" ON public.dramas;
CREATE POLICY "dramas owner or admin update" ON public.dramas FOR UPDATE
  USING (created_by = auth.uid() OR private.is_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR private.is_admin(auth.uid()));
DROP POLICY IF EXISTS "dramas owner or admin delete" ON public.dramas;
CREATE POLICY "dramas owner or admin delete" ON public.dramas FOR DELETE
  USING (created_by = auth.uid() OR private.is_admin(auth.uid()));

-- curriculum_plans
DROP POLICY IF EXISTS curriculum_select_own_or_admin ON public.curriculum_plans;
CREATE POLICY curriculum_select_own_or_admin ON public.curriculum_plans FOR SELECT
  USING (created_by = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS curriculum_insert_editor ON public.curriculum_plans;
CREATE POLICY curriculum_insert_editor ON public.curriculum_plans FOR INSERT
  WITH CHECK (created_by = auth.uid() AND (private.has_role(auth.uid(), 'teacher') OR private.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS curriculum_update_own_or_admin ON public.curriculum_plans;
CREATE POLICY curriculum_update_own_or_admin ON public.curriculum_plans FOR UPDATE
  USING (created_by = auth.uid() OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS curriculum_delete_own_or_admin ON public.curriculum_plans;
CREATE POLICY curriculum_delete_own_or_admin ON public.curriculum_plans FOR DELETE
  USING (created_by = auth.uid() OR private.has_role(auth.uid(), 'admin'));

-- storage policies
DROP POLICY IF EXISTS "Songs bucket editor insert" ON storage.objects;
CREATE POLICY "Songs bucket editor insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'songs' AND private.is_editor(auth.uid()));
DROP POLICY IF EXISTS "Songs bucket editor update" ON storage.objects;
CREATE POLICY "Songs bucket editor update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'songs' AND private.is_editor(auth.uid()));
DROP POLICY IF EXISTS "Songs bucket editor delete" ON storage.objects;
CREATE POLICY "Songs bucket editor delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'songs' AND private.is_editor(auth.uid()));

DROP POLICY IF EXISTS "editors can upload lesson images" ON storage.objects;
CREATE POLICY "editors can upload lesson images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lesson-images' AND private.is_editor(auth.uid()));
DROP POLICY IF EXISTS "editors can update lesson images" ON storage.objects;
CREATE POLICY "editors can update lesson images" ON storage.objects FOR UPDATE
  USING (bucket_id = 'lesson-images' AND private.is_editor(auth.uid()));
DROP POLICY IF EXISTS "editors can delete lesson images" ON storage.objects;
CREATE POLICY "editors can delete lesson images" ON storage.objects FOR DELETE
  USING (bucket_id = 'lesson-images' AND private.is_editor(auth.uid()));

-- Now drop the public-exposed versions
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.is_editor(uuid);
