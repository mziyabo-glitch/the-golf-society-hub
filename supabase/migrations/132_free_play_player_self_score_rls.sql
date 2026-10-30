-- Allow society members / app users on a free-play roster to upsert their own hole scores
-- and aggregate rows (not only the round creator), while keeping cross-society isolation.

CREATE OR REPLACE FUNCTION public.free_play_is_own_round_player(p_round_id uuid, p_round_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.free_play_round_players p
    WHERE p.id = p_round_player_id
      AND p.round_id = p_round_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.members m
          WHERE m.id = p.member_id
            AND m.user_id = auth.uid()
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.free_play_is_own_round_player(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS free_play_round_hole_scores_mutate ON public.free_play_round_hole_scores;
CREATE POLICY free_play_round_hole_scores_mutate ON public.free_play_round_hole_scores
  FOR ALL TO authenticated
  USING (
    public.free_play_can_manage_round(round_id)
    OR public.free_play_is_own_round_player(round_id, round_player_id)
  )
  WITH CHECK (
    public.free_play_can_manage_round(round_id)
    OR public.free_play_is_own_round_player(round_id, round_player_id)
  );

DROP POLICY IF EXISTS free_play_round_scores_mutate ON public.free_play_round_scores;

CREATE POLICY free_play_round_scores_insert ON public.free_play_round_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.free_play_can_manage_round(round_id)
    OR public.free_play_is_own_round_player(round_id, round_player_id)
  );

CREATE POLICY free_play_round_scores_update ON public.free_play_round_scores
  FOR UPDATE TO authenticated
  USING (
    public.free_play_can_manage_round(round_id)
    OR public.free_play_is_own_round_player(round_id, round_player_id)
  )
  WITH CHECK (
    public.free_play_can_manage_round(round_id)
    OR public.free_play_is_own_round_player(round_id, round_player_id)
  );

CREATE POLICY free_play_round_scores_delete ON public.free_play_round_scores
  FOR DELETE TO authenticated
  USING (
    public.free_play_can_manage_round(round_id)
    OR public.free_play_is_own_round_player(round_id, round_player_id)
  );

NOTIFY pgrst, 'reload schema';
