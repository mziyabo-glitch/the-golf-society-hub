-- Final stable Free Play SELECT RLS:
-- - restore participant visibility (creator + roster participants)
-- - avoid recursion by keeping helper internals on players/members only
-- - force helper queries to bypass RLS with SECURITY DEFINER + row_security=off

-- ---------------------------------------------------------------------------
-- Helpers
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

-- ---------------------------------------------------------------------------
-- SELECT policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS free_play_rounds_select ON public.free_play_rounds;
CREATE POLICY free_play_rounds_select ON public.free_play_rounds
  FOR SELECT TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR public.free_play_can_read_round(id)
  );

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
    OR public.free_play_can_read_round(round_id)
    OR public.free_play_can_manage_round(round_id)
  );

DROP POLICY IF EXISTS free_play_round_scores_select ON public.free_play_round_scores;
CREATE POLICY free_play_round_scores_select ON public.free_play_round_scores
  FOR SELECT TO authenticated
  USING (public.free_play_can_read_round(round_id));

DROP POLICY IF EXISTS free_play_round_hole_scores_select ON public.free_play_round_hole_scores;
CREATE POLICY free_play_round_hole_scores_select ON public.free_play_round_hole_scores
  FOR SELECT TO authenticated
  USING (public.free_play_can_read_round(round_id));

NOTIFY pgrst, 'reload schema';
