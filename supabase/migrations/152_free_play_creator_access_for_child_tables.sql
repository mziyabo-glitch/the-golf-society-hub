-- Ensure round creators can read/manage child rows even when they don't have
-- a matching free_play_round_players user_id/member_id mapping.

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
    FROM public.free_play_rounds r
    WHERE r.id = p_round_id
      AND r.created_by_user_id = auth.uid()
  )
  OR EXISTS (
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
    FROM public.free_play_rounds r
    WHERE r.id = p_round_id
      AND r.created_by_user_id = auth.uid()
  )
  OR EXISTS (
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

NOTIFY pgrst, 'reload schema';
