-- 055_course_tees_gender_yards.sql
-- Add gender and yards to course_tees for WHS and display.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'course_tees'
  ) THEN
    ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS gender text;
    ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS yards integer;
    ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS tee_color text;
  END IF;
END $$;

