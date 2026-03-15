-- Add tee_source to events for resilience: 'imported' | 'manual'
-- Enables local-first tee setup: event can persist tee data independently of course import success.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'tee_source'
  ) THEN
    ALTER TABLE public.events ADD COLUMN tee_source text;
  END IF;
END $$;

COMMENT ON COLUMN public.events.tee_source IS 'Source of tee data: imported (from course_tees) or manual (user-entered).';
