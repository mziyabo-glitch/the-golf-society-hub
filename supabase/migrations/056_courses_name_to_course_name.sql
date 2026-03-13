-- Rename courses.name to course_name for consistency with events.course_name
-- Safe: only runs if name exists and course_name does not
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'course_name'
  ) THEN
    ALTER TABLE public.courses RENAME COLUMN name TO course_name;
  END IF;
END $$;
