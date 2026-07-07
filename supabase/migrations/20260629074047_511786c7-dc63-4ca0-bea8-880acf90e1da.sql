
CREATE TABLE public.vocabulary (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zh TEXT NOT NULL,
  pinyin TEXT,
  ko TEXT,
  hsk INTEGER,
  emoji TEXT,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, zh)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vocabulary TO authenticated;
GRANT ALL ON public.vocabulary TO service_role;

ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own vocabulary"
  ON public.vocabulary FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_vocabulary_user ON public.vocabulary(user_id, created_at DESC);
