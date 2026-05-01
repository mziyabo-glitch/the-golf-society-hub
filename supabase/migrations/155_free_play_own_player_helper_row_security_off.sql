-- Ensure free_play_is_own_round_player never hits RLS recursion when used from
-- free_play_round_hole_scores / free_play_round_scores mutate policies.

CREATE OR REPLACE FUNCTION public.free_play_is_own_round_player(p_round_id uuid, p_round_player_id uuid)
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

NOTIFY pgrst, 'reload schema';
