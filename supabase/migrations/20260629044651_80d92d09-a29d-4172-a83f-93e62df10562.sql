
ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS suno_audio_task_id text,
  ADD COLUMN IF NOT EXISTS suno_mp4_task_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS style text,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS vocab jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quiz jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cultural_note jsonb;

-- media_url is now populated by Suno; allow NULL while audio is generating.
ALTER TABLE public.songs ALTER COLUMN media_url DROP NOT NULL;

-- Storage policies for the private `songs` bucket: public read, editor-only write.
DROP POLICY IF EXISTS "Songs bucket public read" ON storage.objects;
CREATE POLICY "Songs bucket public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'songs');

DROP POLICY IF EXISTS "Songs bucket editor insert" ON storage.objects;
CREATE POLICY "Songs bucket editor insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'songs' AND public.is_editor(auth.uid()));

DROP POLICY IF EXISTS "Songs bucket editor update" ON storage.objects;
CREATE POLICY "Songs bucket editor update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'songs' AND public.is_editor(auth.uid()));

DROP POLICY IF EXISTS "Songs bucket editor delete" ON storage.objects;
CREATE POLICY "Songs bucket editor delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'songs' AND public.is_editor(auth.uid()));
