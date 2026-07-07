
CREATE TABLE public.curriculum_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  student_grade TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 50,
  interests TEXT[] NOT NULL DEFAULT '{}',
  preferred_activities TEXT[] NOT NULL DEFAULT '{}',
  special_notes TEXT,
  lesson_objective_hint TEXT,
  title TEXT NOT NULL DEFAULT '',
  objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
  materials JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  assessment JSONB NOT NULL DEFAULT '{}'::jsonb,
  handout_markdown TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_plans TO authenticated;
GRANT ALL ON public.curriculum_plans TO service_role;

ALTER TABLE public.curriculum_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "curriculum_select_own_or_admin"
  ON public.curriculum_plans FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "curriculum_insert_editor"
  ON public.curriculum_plans FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "curriculum_update_own_or_admin"
  ON public.curriculum_plans FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "curriculum_delete_own_or_admin"
  ON public.curriculum_plans FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER curriculum_plans_set_updated_at
  BEFORE UPDATE ON public.curriculum_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_curriculum_plans_created_by ON public.curriculum_plans(created_by, created_at DESC);
