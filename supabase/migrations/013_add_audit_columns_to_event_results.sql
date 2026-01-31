-- =====================================================
-- MIGRATION 013: Add Audit Columns to Event Results
-- =====================================================
-- Adds day_value and position columns for audit trail
-- =====================================================

-- Add day_value column (the raw score: stableford points or net score)
ALTER TABLE public.event_results
ADD COLUMN IF NOT EXISTS day_value integer;

-- Add position column (finishing position: 1, 2, 3, etc.)
ALTER TABLE public.event_results
ADD COLUMN IF NOT EXISTS position integer;

-- Add comment for clarity
COMMENT ON COLUMN public.event_results.day_value IS 'Raw day score: stableford points (higher=better) or net score (lower=better)';
COMMENT ON COLUMN public.event_results.position IS 'Finishing position in the event (1st, 2nd, etc.)';

-- Verify schema
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'event_results'
ORDER BY ordinal_position;
