CREATE TABLE public.songs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  title_zh text,
  level text NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner','intermediate','advanced')),
  cover_url text,
  media_url text NOT NULL,
  lyrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.songs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.songs TO authenticated;
GRANT ALL ON public.songs TO service_role;

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "songs are publicly readable"
  ON public.songs FOR SELECT
  USING (true);

CREATE POLICY "editors can insert songs"
  ON public.songs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_editor(auth.uid()));

CREATE POLICY "editors can update songs"
  ON public.songs FOR UPDATE
  TO authenticated
  USING (public.is_editor(auth.uid()))
  WITH CHECK (public.is_editor(auth.uid()));

CREATE POLICY "editors can delete songs"
  ON public.songs FOR DELETE
  TO authenticated
  USING (public.is_editor(auth.uid()));

CREATE TRIGGER songs_set_updated_at
  BEFORE UPDATE ON public.songs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();