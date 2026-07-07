CREATE TABLE public.dramas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  title_zh text,
  description text,
  level text NOT NULL DEFAULT 'beginner',
  youtube_url text NOT NULL,
  youtube_video_id text NOT NULL,
  thumbnail_url text,
  duration_seconds integer,
  genre text,
  scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dramas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dramas TO authenticated;
GRANT ALL ON public.dramas TO service_role;

ALTER TABLE public.dramas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dramas public read" ON public.dramas FOR SELECT USING (true);
CREATE POLICY "dramas editor insert" ON public.dramas FOR INSERT TO authenticated
  WITH CHECK (public.is_editor(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "dramas owner or admin update" ON public.dramas FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "dramas owner or admin delete" ON public.dramas FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE TRIGGER dramas_set_updated_at BEFORE UPDATE ON public.dramas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX dramas_created_at_idx ON public.dramas (created_at DESC);