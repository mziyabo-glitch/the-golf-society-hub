-- =====================================================
-- MIGRATION 012: Update Event Format Constraint
-- =====================================================
-- Simplify event formats to: stableford, strokeplay_net, strokeplay_gross
-- Keep 'medal' for backwards compatibility
-- =====================================================

-- Drop the existing format check constraint
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_format_check;

-- Add updated format check constraint with simplified formats
ALTER TABLE public.events
  ADD CONSTRAINT events_format_check
  CHECK (format IN (
    'stableford',        -- High score wins
    'strokeplay_net',    -- Low net score wins
    'strokeplay_gross',  -- Low gross score wins
    'medal'              -- Legacy: treat as strokeplay (low wins)
  ));

-- Migrate existing data: convert old formats to nearest equivalent
-- matchplay, scramble, texas_scramble, fourball, foursomes -> stableford
UPDATE public.events
SET format = 'stableford'
WHERE format IN ('matchplay', 'scramble', 'texas_scramble', 'fourball', 'foursomes');

-- Verification: show all formats in use
SELECT format, COUNT(*) as count FROM public.events GROUP BY format ORDER BY count DESC;
