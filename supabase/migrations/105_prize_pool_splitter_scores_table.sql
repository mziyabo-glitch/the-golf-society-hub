-- Prize Pool (Pot) Splitter score entry table
-- Pot Master enters Front 9 / Back 9 / Birdies per confirmed entrant.
-- Full round score remains in official event_results (Captain/Handicapper source of truth).

CREATE TABLE IF NOT EXISTS public.event_prize_pool_splitter_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.event_prize_pools(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES public.event_guests(id) ON DELETE CASCADE,
  front9_score integer NOT NULL CHECK (front9_score >= 0),
  back9_score integer NOT NULL CHECK (back9_score >= 0),
  birdies integer NOT NULL DEFAULT 0 CHECK (birdies >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_prize_pool_splitter_scores_participant_chk CHECK (
    (member_id IS NOT NULL AND guest_id IS NULL)
    OR (member_id IS NULL AND guest_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_prize_pool_splitter_scores_pool_member_uniq
  ON public.event_prize_pool_splitter_scores (pool_id, member_id)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_prize_pool_splitter_scores_pool_guest_uniq
  ON public.event_prize_pool_splitter_scores (pool_id, guest_id)
  WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_prize_pool_splitter_scores_pool_id
  ON public.event_prize_pool_splitter_scores (pool_id);

CREATE INDEX IF NOT EXISTS idx_event_prize_pool_splitter_scores_event_id
  ON public.event_prize_pool_splitter_scores (event_id);

DROP TRIGGER IF EXISTS trg_event_prize_pool_splitter_scores_updated ON public.event_prize_pool_splitter_scores;
CREATE TRIGGER trg_event_prize_pool_splitter_scores_updated
  BEFORE UPDATE ON public.event_prize_pool_splitter_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.event_prize_pool_splitter_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_prize_pool_splitter_scores_select ON public.event_prize_pool_splitter_scores;
DROP POLICY IF EXISTS event_prize_pool_splitter_scores_insert ON public.event_prize_pool_splitter_scores;
DROP POLICY IF EXISTS event_prize_pool_splitter_scores_update ON public.event_prize_pool_splitter_scores;
DROP POLICY IF EXISTS event_prize_pool_splitter_scores_delete ON public.event_prize_pool_splitter_scores;

CREATE POLICY event_prize_pool_splitter_scores_select
  ON public.event_prize_pool_splitter_scores FOR SELECT TO authenticated
  USING (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_prize_pool_splitter_scores_insert
  ON public.event_prize_pool_splitter_scores FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_prize_pool_splitter_scores_update
  ON public.event_prize_pool_splitter_scores FOR UPDATE TO authenticated
  USING (public.user_can_manage_event_prize_pools(event_id))
  WITH CHECK (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_prize_pool_splitter_scores_delete
  ON public.event_prize_pool_splitter_scores FOR DELETE TO authenticated
  USING (public.user_can_manage_event_prize_pools(event_id));

-- Keep prize pool calculations in sync when splitter inputs change.
DROP TRIGGER IF EXISTS trg_event_prize_pool_splitter_scores_invalidate_prize_pools ON public.event_prize_pool_splitter_scores;
CREATE TRIGGER trg_event_prize_pool_splitter_scores_invalidate_prize_pools
  AFTER INSERT OR UPDATE OR DELETE ON public.event_prize_pool_splitter_scores
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_calculated_prize_pools_for_event();

COMMENT ON TABLE public.event_prize_pool_splitter_scores IS
  'Pot Master splitter metrics per pool entrant. Best Overall still uses official event_results.';
COMMENT ON COLUMN public.event_prize_pool_splitter_scores.front9_score IS
  'Pot Master entered Front 9 score for splitter category payouts.';
COMMENT ON COLUMN public.event_prize_pool_splitter_scores.back9_score IS
  'Pot Master entered Back 9 score for splitter category payouts.';
COMMENT ON COLUMN public.event_prize_pool_splitter_scores.birdies IS
  'Pot Master entered birdie count for splitter category payouts.';

-- ---------------------------------------------------------------------------
-- Official full scores: Captain or Handicapper only (no Secretary writes)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "event_results_insert" ON public.event_results;
DROP POLICY IF EXISTS "event_results_update" ON public.event_results;

CREATE POLICY "event_results_insert"
  ON public.event_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.society_id = society_id
        AND m.user_id = auth.uid()
        AND LOWER(m.role) IN ('captain', 'handicapper')
    )
  );

CREATE POLICY "event_results_update"
  ON public.event_results
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.society_id = public.event_results.society_id
        AND m.user_id = auth.uid()
        AND LOWER(m.role) IN ('captain', 'handicapper')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.society_id = society_id
        AND m.user_id = auth.uid()
        AND LOWER(m.role) IN ('captain', 'handicapper')
    )
  );

NOTIFY pgrst, 'reload schema';
