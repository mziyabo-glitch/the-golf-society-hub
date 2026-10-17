-- Free-play handicap clarity: persist HI, CH and PH distinctly.
-- Adds course_handicap + handicap_source on free_play_round_players and backfills safely.

ALTER TABLE public.free_play_round_players
  ADD COLUMN IF NOT EXISTS course_handicap integer,
  ADD COLUMN IF NOT EXISTS handicap_source text;

UPDATE public.free_play_round_players
SET
  course_handicap = COALESCE(course_handicap, round(handicap_index)::int),
  handicap_source = COALESCE(NULLIF(btrim(handicap_source), ''), 'auto')
WHERE course_handicap IS NULL
   OR handicap_source IS NULL
   OR btrim(coalesce(handicap_source, '')) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'free_play_round_players_handicap_source_chk'
  ) THEN
    ALTER TABLE public.free_play_round_players
      ADD CONSTRAINT free_play_round_players_handicap_source_chk
      CHECK (handicap_source IN ('auto', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_free_play_round_players_handicap_source
  ON public.free_play_round_players(handicap_source);
