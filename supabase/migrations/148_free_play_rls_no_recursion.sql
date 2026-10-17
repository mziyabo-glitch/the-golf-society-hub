-- Free Play RLS: remove infinite recursion (54001 stack depth exceeded).
--
-- Cause: free_play_rounds SELECT referenced free_play_round_players; players SELECT used
-- free_play_can_read_round(), which queried free_play_rounds again → RLS re-entry loop.
--
-- Fix:
-- - free_play_round_players / scores / hole_scores SELECT: inline roster visibility only
--   (players + members), no helper that reads free_play_rounds.
-- - free_play_can_read_round / free_play_can_manage_round: implement using only
--   free_play_round_players + public.members (never scan free_play_rounds).
-- - free_play_rounds SELECT: same roster semantics as players (user_id OR member profile link),
--   plus created_by_user_id = auth.uid() for the gap before player rows exist.

-- ---------------------------------------------------------------------------
-- 1) Rounds SELECT — align EXISTS with member-linked roster (not user_id only)
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
-- 2) Players SELECT — avoid self-referencing players EXISTS in policy
--    (use SECURITY DEFINER helpers instead)
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
    OR public.free_play_can_read_round(free_play_round_players.round_id)
    OR public.free_play_can_manage_round(free_play_round_players.round_id)
  );

-- ---------------------------------------------------------------------------
-- 3) Scores / hole scores SELECT — roster visibility only (no rounds table)
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

-- ---------------------------------------------------------------------------
-- 4) Helpers — SECURITY DEFINER; body touches only players + members
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.free_play_can_manage_round(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.free_play_round_players p
    WHERE p.round_id = p_round_id
      AND p.is_owner = true
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

CREATE OR REPLACE FUNCTION public.free_play_can_read_round(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.free_play_round_players p
    WHERE p.round_id = p_round_id
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

CREATE OR REPLACE FUNCTION public.free_play_can_access_round(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.free_play_can_read_round(p_round_id);
$$;

-- can_access_free_play_round (122): still referenced only by legacy tooling; keep non-recursive.
CREATE OR REPLACE FUNCTION public.can_access_free_play_round(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.free_play_can_read_round(p_round_id);
$$;

GRANT EXECUTE ON FUNCTION public.free_play_can_read_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.free_play_can_manage_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.free_play_can_access_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_free_play_round(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
