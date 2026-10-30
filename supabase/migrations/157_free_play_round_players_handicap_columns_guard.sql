-- Guard migration for environments missing migration 140 columns.
-- Keeps Free Play player inserts compatible with current app payload.

ALTER TABLE public.free_play_round_players
  ADD COLUMN IF NOT EXISTS course_handicap numeric,
  ADD COLUMN IF NOT EXISTS handicap_source text;

-- Ensure existing rows have usable defaults for round creation + edits.
UPDATE public.free_play_round_players
SET
  course_handicap = COALESCE(course_handicap, round(handicap_index)),
  handicap_source = COALESCE(NULLIF(btrim(handicap_source), ''), 'auto')
WHERE course_handicap IS NULL
   OR handicap_source IS NULL
   OR btrim(coalesce(handicap_source, '')) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'free_play_round_players_handicap_source_chk'
  ) THEN
    ALTER TABLE public.free_play_round_players
      ADD CONSTRAINT free_play_round_players_handicap_source_chk
      CHECK (handicap_source IN ('auto', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_free_play_round_players_course_handicap
  ON public.free_play_round_players(course_handicap);

CREATE INDEX IF NOT EXISTS idx_free_play_round_players_handicap_source
  ON public.free_play_round_players(handicap_source);
