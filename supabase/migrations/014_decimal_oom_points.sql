-- =====================================================
-- MIGRATION 014: Change OOM points to decimal
-- =====================================================
-- Allows tie averaging to store decimal points (e.g., 16.5)
-- Changes event_results.points from INTEGER to NUMERIC(6,2)
-- =====================================================

-- Change points column from INTEGER to NUMERIC(6,2)
-- This preserves existing integer values and allows decimals
ALTER TABLE public.event_results
ALTER COLUMN points TYPE NUMERIC(6,2);

-- Update the default (still 0, but now numeric)
ALTER TABLE public.event_results
ALTER COLUMN points SET DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.event_results.points IS 'OOM points (can be decimal for tie averaging, e.g., 16.5)';

-- Verify the change
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'event_results'
ORDER BY ordinal_position;
