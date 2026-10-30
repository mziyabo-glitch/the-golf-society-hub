-- Make child-table SELECT visibility explicit for round creators.
-- This avoids depending on helper chaining during policy evaluation.

CREATE OR REPLACE FUNCTION public.free_play_is_round_creator(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.free_play_rounds r
    WHERE r.id = p_round_id
      AND r.created_by_user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.free_play_is_round_creator(uuid) TO authenticated;

DROP POLICY IF EXISTS free_play_round_players_select ON public.free_play_round_players;
CREATE POLICY free_play_round_players_select ON public.free_play_round_players
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.id = free_play_round_players.member_id
        AND m.user_id = auth.uid()
    )
    OR public.free_play_is_round_creator(round_id)
    OR public.free_play_can_read_round(round_id)
  );

DROP POLICY IF EXISTS free_play_round_scores_select ON public.free_play_round_scores;
CREATE POLICY free_play_round_scores_select ON public.free_play_round_scores
  FOR SELECT TO authenticated
  USING (
    public.free_play_is_round_creator(round_id)
    OR public.free_play_can_read_round(round_id)
  );

DROP POLICY IF EXISTS free_play_round_hole_scores_select ON public.free_play_round_hole_scores;
CREATE POLICY free_play_round_hole_scores_select ON public.free_play_round_hole_scores
  FOR SELECT TO authenticated
  USING (
    public.free_play_is_round_creator(round_id)
    OR public.free_play_can_read_round(round_id)
  );

NOTIFY pgrst, 'reload schema';
