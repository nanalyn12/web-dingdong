ALTER TABLE public.vocabulary
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS srs_ease real NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS srs_interval_days real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_reps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_lapses integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_due_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS srs_last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS idx_vocabulary_user_due
  ON public.vocabulary (user_id, srs_due_at);
CREATE INDEX IF NOT EXISTS idx_vocabulary_tags
  ON public.vocabulary USING gin (tags);