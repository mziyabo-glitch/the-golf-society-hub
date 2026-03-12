-- Add tee_id to events (optional: when captain selects a tee from course_tees)
-- NOTE: course_tees table is created by migration 049_golf_api_course_import.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'tee_id'
  ) THEN
    ALTER TABLE public.events ADD COLUMN tee_id uuid REFERENCES public.course_tees(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.events.tee_id IS 'Selected tee from course_tees; denormalized tee_name/par/course_rating/slope_rating still stored on event.';
