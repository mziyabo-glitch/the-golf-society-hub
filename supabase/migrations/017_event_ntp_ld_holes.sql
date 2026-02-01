-- =====================================================
-- MIGRATION 017: Event NTP and Longest Drive Holes
-- Run this in Supabase SQL Editor
-- =====================================================
--
-- This migration adds:
-- - nearest_pin_holes: Array of hole numbers for Nearest the Pin competitions
-- - longest_drive_holes: Array of hole numbers for Longest Drive competitions
-- =====================================================

-- Add nearest_pin_holes column (array of hole numbers 1-18)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'nearest_pin_holes'
  ) THEN
    ALTER TABLE public.events ADD COLUMN nearest_pin_holes integer[] DEFAULT '{}';
  END IF;
END $$;

-- Add longest_drive_holes column (array of hole numbers 1-18)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'longest_drive_holes'
  ) THEN
    ALTER TABLE public.events ADD COLUMN longest_drive_holes integer[] DEFAULT '{}';
  END IF;
END $$;

-- Add CHECK constraint for nearest_pin_holes (all values must be 1-18)
-- Note: PostgreSQL array constraints are complex, so we use a function
CREATE OR REPLACE FUNCTION public.check_hole_numbers(holes integer[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF holes IS NULL OR array_length(holes, 1) IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Check all values are between 1 and 18
  RETURN NOT EXISTS (
    SELECT 1 FROM unnest(holes) AS h WHERE h < 1 OR h > 18
  );
END;
$$;

-- Add constraints using the function
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_nearest_pin_holes_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_nearest_pin_holes_check
      CHECK (public.check_hole_numbers(nearest_pin_holes));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_longest_drive_holes_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_longest_drive_holes_check
      CHECK (public.check_hole_numbers(longest_drive_holes));
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
  AND column_name IN ('nearest_pin_holes', 'longest_drive_holes')
ORDER BY ordinal_position;
