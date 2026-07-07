ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS dialogue_scene text,
  ADD COLUMN IF NOT EXISTS video_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vocab_comparison jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cultural_snippet jsonb NOT NULL DEFAULT '{}'::jsonb;