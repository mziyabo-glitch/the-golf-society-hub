-- Add explicit tee snapshot fields for event rendering.
-- Single source of truth: event stores its own tee snapshot, no dynamic reconstruction.

DO $$
BEGIN
  -- Single mode (one tee for all)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'single_tee_name') THEN
    ALTER TABLE public.events ADD COLUMN single_tee_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'single_course_rating') THEN
    ALTER TABLE public.events ADD COLUMN single_course_rating numeric(4,1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'single_slope_rating') THEN
    ALTER TABLE public.events ADD COLUMN single_slope_rating integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'single_par') THEN
    ALTER TABLE public.events ADD COLUMN single_par integer;
  END IF;

  -- Male tee (separate mode)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'male_tee_name') THEN
    ALTER TABLE public.events ADD COLUMN male_tee_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'male_course_rating') THEN
    ALTER TABLE public.events ADD COLUMN male_course_rating numeric(4,1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'male_slope_rating') THEN
    ALTER TABLE public.events ADD COLUMN male_slope_rating integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'male_par') THEN
    ALTER TABLE public.events ADD COLUMN male_par integer;
  END IF;

  -- Female tee (separate mode)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'female_tee_name') THEN
    ALTER TABLE public.events ADD COLUMN female_tee_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'female_course_rating') THEN
    ALTER TABLE public.events ADD COLUMN female_course_rating numeric(4,1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'female_slope_rating') THEN
    ALTER TABLE public.events ADD COLUMN female_slope_rating integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'female_par') THEN
    ALTER TABLE public.events ADD COLUMN female_par integer;
  END IF;
END $$;

-- Backfill from legacy tee_name, par, course_rating, slope_rating, ladies_*
UPDATE public.events
SET
  single_tee_name = COALESCE(single_tee_name, tee_name),
  single_course_rating = COALESCE(single_course_rating, course_rating),
  single_slope_rating = COALESCE(single_slope_rating, slope_rating),
  single_par = COALESCE(single_par, par),
  male_tee_name = COALESCE(male_tee_name, tee_name),
  male_course_rating = COALESCE(male_course_rating, course_rating),
  male_slope_rating = COALESCE(male_slope_rating, slope_rating),
  male_par = COALESCE(male_par, par),
  female_tee_name = COALESCE(female_tee_name, ladies_tee_name),
  female_course_rating = COALESCE(female_course_rating, ladies_course_rating),
  female_slope_rating = COALESCE(female_slope_rating, ladies_slope_rating),
  female_par = COALESCE(female_par, ladies_par)
WHERE tee_name IS NOT NULL OR ladies_tee_name IS NOT NULL OR par IS NOT NULL OR ladies_par IS NOT NULL;

COMMENT ON COLUMN public.events.single_tee_name IS 'Tee name when tee_setup_mode=single';
COMMENT ON COLUMN public.events.male_tee_name IS 'Male tee name when tee_setup_mode=separate';
COMMENT ON COLUMN public.events.female_tee_name IS 'Female tee name when tee_setup_mode=separate';
