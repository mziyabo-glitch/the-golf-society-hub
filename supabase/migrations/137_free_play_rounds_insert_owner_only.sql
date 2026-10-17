-- Free Play: allow any authenticated user to INSERT a round they own.
--
-- 131 required society membership via EXISTS on public.members inside WITH CHECK (invoker RLS).
-- 136 moved that to SECURITY DEFINER free_play_user_member_of_society(); some deployments still
-- see 42501 if the definer role is subject to RLS on members or membership data is absent/stale.
--
-- This policy matches product intent: you cannot create a round for someone else because
-- created_by_user_id must equal auth.uid(). Society-scoped visibility remains on SELECT via
-- free_play_can_read_round; optional app validation can still prefer society_id for UX.

DROP POLICY IF EXISTS free_play_rounds_insert ON public.free_play_rounds;
CREATE POLICY free_play_rounds_insert ON public.free_play_rounds
  FOR INSERT TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

-- Ensure API role can mutate rows (some forks strip default grants).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.free_play_rounds TO authenticated;

NOTIFY pgrst, 'reload schema';
