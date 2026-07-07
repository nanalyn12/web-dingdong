ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'suno',
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS youtube_id text,
  ADD COLUMN IF NOT EXISTS artist text,
  ADD COLUMN IF NOT EXISTS pinyin jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS translation jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.songs DROP CONSTRAINT IF EXISTS songs_source_check;
ALTER TABLE public.songs
  ADD CONSTRAINT songs_source_check CHECK (source IN ('suno','curated'));