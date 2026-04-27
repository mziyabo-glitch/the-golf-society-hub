-- Align public.free_play_rounds RLS with real schema: owner column is **created_by_user_id**
-- (app payload — not owner_user_id / user_id).
--
-- INSERT / UPDATE / DELETE: creator only (created_by_user_id = auth.uid()).
-- No society-membership predicate on INSERT (avoids invoker-RLS on members breaking WITH CHECK).
--
-- SELECT: creator OR app user on roster (EXISTS player row with user_id = auth.uid()).
--   (Strict SELECT-only-created_by would block join-by-code / "my joined rounds" list.)
--   Society-only visibility without being on roster (old free_play_can_read_round branch) is NOT included here.

DROP POLICY IF EXISTS free_play_rounds_select ON public.free_play_rounds;
DROP POLICY IF EXISTS free_play_rounds_insert ON public.free_play_rounds;
DROP POLICY IF EXISTS free_play_rounds_update ON public.free_play_rounds;
DROP POLICY IF EXISTS free_play_rounds_delete ON public.free_play_rounds;

CREATE POLICY free_play_rounds_select ON public.free_play_rounds
  FOR SELECT TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.free_play_round_players p
      WHERE p.round_id = free_play_rounds.id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY free_play_rounds_insert ON public.free_play_rounds
  FOR INSERT TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY free_play_rounds_update ON public.free_play_rounds
  FOR UPDATE TO authenticated
  USING (created_by_user_id = auth.uid())
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY free_play_rounds_delete ON public.free_play_rounds
  FOR DELETE TO authenticated
  USING (created_by_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.free_play_rounds TO authenticated;

NOTIFY pgrst, 'reload schema';
