-- Add tee_source to events for tracking imported vs manual tee setup.
-- Events already store tee_name, par, course_rating, slope_rating denormalized.
-- tee_source helps UI show status: 'imported' | 'manual'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'tee_source'
  ) THEN
    ALTER TABLE public.events ADD COLUMN tee_source text;
    COMMENT ON COLUMN public.events.tee_source IS 'Source of tee data: imported (from course_tees) or manual (user-entered).';
  END IF;
END $$;
