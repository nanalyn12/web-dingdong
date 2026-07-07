
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_level_check;
UPDATE public.courses SET level = CASE level
  WHEN '입문' THEN 'beginner'
  WHEN '중급' THEN 'intermediate'
  WHEN '고급' THEN 'advanced'
  ELSE level END;
ALTER TABLE public.courses ADD CONSTRAINT courses_level_check
  CHECK (level IN ('beginner','intermediate','advanced'));
