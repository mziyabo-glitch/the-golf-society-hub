-- Prize Pool Pot + Splitter:
-- - add competition type / naming / total mode fields
-- - add detailed official result fields needed for Splitter (front 9, back 9, birdies)
-- - ensure finalised pools block edits for new mutable columns

-- ---------------------------------------------------------------------------
-- event_prize_pools: new competition + total mode fields
-- ---------------------------------------------------------------------------

ALTER TABLE public.event_prize_pools
  ADD COLUMN IF NOT EXISTS competition_name text NOT NULL DEFAULT 'Prize Pool (Pot)';

ALTER TABLE public.event_prize_pools
  ADD COLUMN IF NOT EXISTS competition_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.event_prize_pools
  ADD COLUMN IF NOT EXISTS total_amount_mode text NOT NULL DEFAULT 'manual';

ALTER TABLE public.event_prize_pools
  ADD COLUMN IF NOT EXISTS pot_entry_value_pence integer;

ALTER TABLE public.event_prize_pools
  ADD COLUMN IF NOT EXISTS birdie_fallback_to_overall boolean NOT NULL DEFAULT true;

ALTER TABLE public.event_prize_pools
  DROP CONSTRAINT IF EXISTS event_prize_pools_competition_type_chk;

ALTER TABLE public.event_prize_pools
  ADD CONSTRAINT event_prize_pools_competition_type_chk
  CHECK (competition_type IN ('standard', 'splitter'));

ALTER TABLE public.event_prize_pools
  DROP CONSTRAINT IF EXISTS event_prize_pools_total_amount_mode_chk;

ALTER TABLE public.event_prize_pools
  ADD CONSTRAINT event_prize_pools_total_amount_mode_chk
  CHECK (total_amount_mode IN ('manual', 'per_entrant'));

ALTER TABLE public.event_prize_pools
  DROP CONSTRAINT IF EXISTS event_prize_pools_pot_entry_value_nonnegative_chk;

ALTER TABLE public.event_prize_pools
  ADD CONSTRAINT event_prize_pools_pot_entry_value_nonnegative_chk
  CHECK (pot_entry_value_pence IS NULL OR pot_entry_value_pence >= 0);

UPDATE public.event_prize_pools
SET
  competition_name = COALESCE(NULLIF(trim(competition_name), ''), 'Prize Pool (Pot)'),
  competition_type = COALESCE(NULLIF(trim(competition_type), ''), 'standard'),
  total_amount_mode = COALESCE(NULLIF(trim(total_amount_mode), ''), 'manual'),
  birdie_fallback_to_overall = COALESCE(birdie_fallback_to_overall, true)
WHERE
  competition_name IS NULL
  OR competition_name = ''
  OR competition_type IS NULL
  OR competition_type = ''
  OR total_amount_mode IS NULL
  OR total_amount_mode = ''
  OR birdie_fallback_to_overall IS NULL;

COMMENT ON COLUMN public.event_prize_pools.competition_name IS
  'UI label for competition. Defaults to Prize Pool (Pot).';
COMMENT ON COLUMN public.event_prize_pools.competition_type IS
  'Calculation mode: standard payout rules or splitter category payout.';
COMMENT ON COLUMN public.event_prize_pools.total_amount_mode IS
  'manual = use total_amount_pence, per_entrant = derive from confirmed entrants * pot_entry_value_pence.';
COMMENT ON COLUMN public.event_prize_pools.pot_entry_value_pence IS
  'Per-entrant contribution used when total_amount_mode = per_entrant.';
COMMENT ON COLUMN public.event_prize_pools.birdie_fallback_to_overall IS
  'For splitter mode: if all entrants have zero birdies, roll birdie payout into overall.';

-- Keep finalised immutability guard aligned with new mutable columns.
CREATE OR REPLACE FUNCTION public.event_prize_pools_block_finalised_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'finalised' THEN
    IF NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.total_amount_pence IS DISTINCT FROM OLD.total_amount_pence
      OR NEW.payout_mode IS DISTINCT FROM OLD.payout_mode
      OR NEW.division_source IS DISTINCT FROM OLD.division_source
      OR NEW.places_paid IS DISTINCT FROM OLD.places_paid
      OR NEW.include_guests IS DISTINCT FROM OLD.include_guests
      OR NEW.require_paid IS DISTINCT FROM OLD.require_paid
      OR NEW.require_confirmed IS DISTINCT FROM OLD.require_confirmed
      OR NEW.notes IS DISTINCT FROM OLD.notes
      OR NEW.competition_name IS DISTINCT FROM OLD.competition_name
      OR NEW.competition_type IS DISTINCT FROM OLD.competition_type
      OR NEW.total_amount_mode IS DISTINCT FROM OLD.total_amount_mode
      OR NEW.pot_entry_value_pence IS DISTINCT FROM OLD.pot_entry_value_pence
      OR NEW.birdie_fallback_to_overall IS DISTINCT FROM OLD.birdie_fallback_to_overall
    THEN
      RAISE EXCEPTION 'Finalised pools can no longer be edited.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- event_results: detailed official scoring fields for Splitter categories
-- ---------------------------------------------------------------------------

ALTER TABLE public.event_results
  ADD COLUMN IF NOT EXISTS front_9_value integer;

ALTER TABLE public.event_results
  ADD COLUMN IF NOT EXISTS back_9_value integer;

ALTER TABLE public.event_results
  ADD COLUMN IF NOT EXISTS birdie_count integer;

ALTER TABLE public.event_results
  DROP CONSTRAINT IF EXISTS event_results_birdie_count_nonnegative_chk;

ALTER TABLE public.event_results
  ADD CONSTRAINT event_results_birdie_count_nonnegative_chk
  CHECK (birdie_count IS NULL OR birdie_count >= 0);

COMMENT ON COLUMN public.event_results.front_9_value IS
  'Official front-nine score for splitter payouts (stableford points or strokeplay net by event format).';
COMMENT ON COLUMN public.event_results.back_9_value IS
  'Official back-nine score for splitter payouts (stableford points or strokeplay net by event format).';
COMMENT ON COLUMN public.event_results.birdie_count IS
  'Official birdie count for splitter Most Birdies category.';

NOTIFY pgrst, 'reload schema';
