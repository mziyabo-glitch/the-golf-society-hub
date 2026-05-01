-- Hotfix: eliminate all cross-table work in free_play_rounds SELECT policy.
-- This is a break-glass change to stop recursion/timeouts immediately.
-- Follow-up migration can restore roster-based visibility once stable.

DROP POLICY IF EXISTS free_play_rounds_select ON public.free_play_rounds;
CREATE POLICY free_play_rounds_select ON public.free_play_rounds
  FOR SELECT TO authenticated
  USING (created_by_user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
