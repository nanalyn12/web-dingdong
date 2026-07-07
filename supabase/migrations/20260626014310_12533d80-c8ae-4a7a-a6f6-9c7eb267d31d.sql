-- updated_at 자동 갱신 함수 (재사용)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================
-- courses
-- =========================
CREATE TABLE public.courses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  level        TEXT NOT NULL CHECK (level IN ('입문', '중급', '고급')),
  thumbnail_url TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.courses TO anon, authenticated;
GRANT ALL ON public.courses TO service_role;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- 누구나 코스 목록/상세 조회 가능
CREATE POLICY "Courses are viewable by everyone"
  ON public.courses FOR SELECT
  USING (true);

-- 쓰기는 service_role만 (별도 POLICY 없음 → 일반 사용자 차단)

CREATE TRIGGER courses_set_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- lessons
-- =========================
CREATE TABLE public.lessons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  order_index      INTEGER NOT NULL,           -- 스펙의 "order" (예약어 회피)
  title            TEXT NOT NULL,
  content_md       TEXT,
  lesson_type      TEXT,                       -- 예: standard / story / drama 등
  key_expressions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  cultural_note    JSONB NOT NULL DEFAULT '{}'::jsonb,
  dialogues        JSONB NOT NULL DEFAULT '[]'::jsonb,
  slides           JSONB NOT NULL DEFAULT '[]'::jsonb,
  quiz             JSONB NOT NULL DEFAULT '[]'::jsonb,
  comic_panels     JSONB NOT NULL DEFAULT '[]'::jsonb,
  storybook_pages  JSONB NOT NULL DEFAULT '[]'::jsonb,
  video            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lessons_course_order_unique UNIQUE (course_id, order_index)
);

CREATE INDEX lessons_course_id_idx ON public.lessons (course_id, order_index);

GRANT SELECT ON public.lessons TO anon, authenticated;
GRANT ALL ON public.lessons TO service_role;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- 누구나 레슨 조회 가능
CREATE POLICY "Lessons are viewable by everyone"
  ON public.lessons FOR SELECT
  USING (true);

-- 쓰기는 service_role만 (별도 POLICY 없음 → 일반 사용자 차단)

CREATE TRIGGER lessons_set_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();