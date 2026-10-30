-- Free Play RLS hard fix:
-- - avoid recursive policy lookups on free_play_rounds
-- - keep participant access checks centralized for child tables

CREATE OR REPLACE FUNCTION public.free_play_can_access_round(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.free_play_rounds r
      WHERE r.id = p_round_id
        AND r.created_by_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.free_play_round_players p
      WHERE p.round_id = p_round_id
        AND p.user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.free_play_can_access_round(uuid) TO authenticated;

-- free_play_rounds (no helper function here; keep direct to prevent recursion edge-cases)
DROP POLICY IF EXISTS free_play_rounds_select ON public.free_play_rounds;
CREATE POLICY free_play_rounds_select ON public.free_play_rounds
  FOR SELECT TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.free_play_round_players p
      WHERE p.round_id = free_play_rounds.id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS free_play_rounds_insert ON public.free_play_rounds;
CREATE POLICY free_play_rounds_insert ON public.free_play_rounds
  FOR INSERT TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

DROP POLICY IF EXISTS free_play_rounds_update ON public.free_play_rounds;
CREATE POLICY free_play_rounds_update ON public.free_play_rounds
  FOR UPDATE TO authenticated
  USING (created_by_user_id = auth.uid() OR public.free_play_can_access_round(id))
  WITH CHECK (created_by_user_id = auth.uid() OR public.free_play_can_access_round(id));

DROP POLICY IF EXISTS free_play_rounds_delete ON public.free_play_rounds;
CREATE POLICY free_play_rounds_delete ON public.free_play_rounds
  FOR DELETE TO authenticated
  USING (created_by_user_id = auth.uid());

-- free_play_round_players
DROP POLICY IF EXISTS free_play_round_players_select ON public.free_play_round_players;
CREATE POLICY free_play_round_players_select ON public.free_play_round_players
  FOR SELECT TO authenticated
  USING (public.free_play_can_access_round(round_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS free_play_round_players_insert ON public.free_play_round_players;
CREATE POLICY free_play_round_players_insert ON public.free_play_round_players
  FOR INSERT TO authenticated
  WITH CHECK (public.free_play_can_access_round(round_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS free_play_round_players_update ON public.free_play_round_players;
CREATE POLICY free_play_round_players_update ON public.free_play_round_players
  FOR UPDATE TO authenticated
  USING (public.free_play_can_access_round(round_id))
  WITH CHECK (public.free_play_can_access_round(round_id));

DROP POLICY IF EXISTS free_play_round_players_delete ON public.free_play_round_players;
CREATE POLICY free_play_round_players_delete ON public.free_play_round_players
  FOR DELETE TO authenticated
  USING (public.free_play_can_access_round(round_id));

-- free_play_round_scores
DROP POLICY IF EXISTS free_play_round_scores_select ON public.free_play_round_scores;
CREATE POLICY free_play_round_scores_select ON public.free_play_round_scores
  FOR SELECT TO authenticated
  USING (public.free_play_can_access_round(round_id));

DROP POLICY IF EXISTS free_play_round_scores_mutate ON public.free_play_round_scores;
CREATE POLICY free_play_round_scores_mutate ON public.free_play_round_scores
  FOR ALL TO authenticated
  USING (public.free_play_can_access_round(round_id))
  WITH CHECK (public.free_play_can_access_round(round_id));

-- free_play_round_hole_scores
DROP POLICY IF EXISTS free_play_round_hole_scores_select ON public.free_play_round_hole_scores;
CREATE POLICY free_play_round_hole_scores_select ON public.free_play_round_hole_scores
  FOR SELECT TO authenticated
  USING (public.free_play_can_access_round(round_id));

DROP POLICY IF EXISTS free_play_round_hole_scores_mutate ON public.free_play_round_hole_scores;
CREATE POLICY free_play_round_hole_scores_mutate ON public.free_play_round_hole_scores
  FOR ALL TO authenticated
  USING (public.free_play_can_access_round(round_id))
  WITH CHECK (public.free_play_can_access_round(round_id));

NOTIFY pgrst, 'reload schema';
