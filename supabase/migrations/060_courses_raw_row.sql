-- Add courses.raw_row for GolfCourseAPI import (NOT NULL jsonb)
-- Stores original API response for audit/debug. Required by schema.
-- Type: jsonb (pass JS object from Supabase client).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'raw_row'
  ) THEN
    ALTER TABLE public.courses ADD COLUMN raw_row jsonb NOT NULL DEFAULT '{}';
    COMMENT ON COLUMN public.courses.raw_row IS 'Original API response (GolfCourseAPI) or source payload; jsonb for querying';
  END IF;
END $$;
