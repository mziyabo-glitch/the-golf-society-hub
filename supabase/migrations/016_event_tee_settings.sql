-- =====================================================
-- MIGRATION 016: Event Tee Settings for WHS Handicap Calculations
-- Run this in Supabase SQL Editor
-- =====================================================
--
-- This migration adds tee settings to events for WHS-ready calculations:
-- - tee_name (e.g., "White Tees", "Yellow Tees")
-- - par (e.g., 72)
-- - course_rating (e.g., 72.5)
-- - slope_rating (e.g., 127)
-- - handicap_allowance (default 0.95 for individual play)
--
-- Formula:
-- Course Handicap (CH) = HI * (Slope/113) + (CourseRating - Par)
-- Playing Handicap (PH) = CH * handicap_allowance, rounded to nearest int
-- =====================================================

-- Add tee_name column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'tee_name'
  ) THEN
    ALTER TABLE public.events ADD COLUMN tee_name text;
  END IF;
END $$;

-- Add par column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'par'
  ) THEN
    ALTER TABLE public.events ADD COLUMN par integer;
  END IF;
END $$;

-- Add course_rating column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'course_rating'
  ) THEN
    ALTER TABLE public.events ADD COLUMN course_rating numeric(4,1);
  END IF;
END $$;

-- Add slope_rating column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'slope_rating'
  ) THEN
    ALTER TABLE public.events ADD COLUMN slope_rating integer;
  END IF;
END $$;

-- Add handicap_allowance column with default 0.95 (95% for individual stroke play)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'handicap_allowance'
  ) THEN
    ALTER TABLE public.events ADD COLUMN handicap_allowance numeric(3,2) DEFAULT 0.95;
  END IF;
END $$;

-- Add CHECK constraints for validity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_par_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_par_check
      CHECK (par IS NULL OR (par >= 27 AND par <= 90));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_course_rating_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_course_rating_check
      CHECK (course_rating IS NULL OR (course_rating >= 50 AND course_rating <= 85));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_slope_rating_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_slope_rating_check
      CHECK (slope_rating IS NULL OR (slope_rating >= 55 AND slope_rating <= 155));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_handicap_allowance_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_handicap_allowance_check
      CHECK (handicap_allowance IS NULL OR (handicap_allowance >= 0.10 AND handicap_allowance <= 1.00));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check events schema for new columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'events'
  AND column_name IN ('tee_name', 'par', 'course_rating', 'slope_rating', 'handicap_allowance')
ORDER BY ordinal_position;

-- Check new constraints
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.events'::regclass
  AND conname IN ('events_par_check', 'events_course_rating_check', 'events_slope_rating_check', 'events_handicap_allowance_check');
