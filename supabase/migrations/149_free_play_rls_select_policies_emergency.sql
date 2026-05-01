-- Emergency hardening for Free Play SELECT RLS to eliminate recursion/timeouts.
-- Goal: no SELECT policy should call helper functions that query protected tables.

-- ---------------------------------------------------------------------------
-- 1) Rounds SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS free_play_rounds_select ON public.free_play_rounds;
CREATE POLICY free_play_rounds_select ON public.free_play_rounds
  FOR SELECT TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.free_play_round_players p
      WHERE p.round_id = free_play_rounds.id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.members m
            WHERE m.id = p.member_id
              AND m.user_id = auth.uid()
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Players SELECT (no helper calls)
-- ---------------------------------------------------------------------------
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
  );

-- ---------------------------------------------------------------------------
-- 3) Scores SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS free_play_round_scores_select ON public.free_play_round_scores;
CREATE POLICY free_play_round_scores_select ON public.free_play_round_scores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.free_play_round_players p
      WHERE p.round_id = free_play_round_scores.round_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.members m
            WHERE m.id = p.member_id
              AND m.user_id = auth.uid()
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Hole scores SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS free_play_round_hole_scores_select ON public.free_play_round_hole_scores;
CREATE POLICY free_play_round_hole_scores_select ON public.free_play_round_hole_scores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.free_play_round_players p
      WHERE p.round_id = free_play_round_hole_scores.round_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.members m
            WHERE m.id = p.member_id
              AND m.user_id = auth.uid()
          )
        )
    )
  );

NOTIFY pgrst, 'reload schema';
