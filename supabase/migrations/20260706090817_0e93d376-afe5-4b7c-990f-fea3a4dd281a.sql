ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS teacher_application_note text,
  ADD COLUMN IF NOT EXISTS teacher_applied_at timestamptz;