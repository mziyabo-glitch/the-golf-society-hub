-- Fix 403 on INSERT into free_play_rounds when society_id is set:
-- Policy in 131 used EXISTS (SELECT ... FROM members) inside WITH CHECK, which runs as the
-- invoker and is subject to members RLS — the membership row may be invisible, so the check
-- fails even for legitimate creators.
--
-- Use a SECURITY DEFINER helper (same pattern as free_play_can_manage_round) so membership
-- is evaluated reliably while still requiring created_by_user_id = auth.uid().

CREATE OR REPLACE FUNCTION public.free_play_user_member_of_society(p_society_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_society_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.society_id = p_society_id
        AND m.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.free_play_user_member_of_society(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.free_play_user_member_of_society(uuid) TO authenticated;

DROP POLICY IF EXISTS free_play_rounds_insert ON public.free_play_rounds;
CREATE POLICY free_play_rounds_insert ON public.free_play_rounds
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND (
      society_id IS NULL
      OR public.free_play_user_member_of_society(society_id)
    )
  );

NOTIFY pgrst, 'reload schema';
