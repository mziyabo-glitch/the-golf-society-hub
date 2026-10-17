-- Canonical RLS for public.free_play_rounds (INSERT 42501 fixes).
-- Superseded for SELECT semantics by 139_free_play_rounds_rls_created_by_user_id.sql (owner column + roster read).
--
-- Schema (122 + 131): owner column is **created_by_user_id** (uuid NOT NULL) — not owner_user_id.
-- Related: created_by_member_id (optional FK to public.members), society_id (optional FK to societies).
--
-- Rules:
-- - INSERT: any authenticated user may insert a row only if created_by_user_id = auth.uid()
--   (cannot create a round on behalf of another user). society_id / member_id are not restricted here.
-- - SELECT: unchanged visibility — creator, roster app users, or same-society member (131 helper).
-- - UPDATE / DELETE: round creator only (created_by_user_id = auth.uid()), WITH CHECK prevents owner transfer.

DROP POLICY IF EXISTS free_play_rounds_select ON public.free_play_rounds;
DROP POLICY IF EXISTS free_play_rounds_insert ON public.free_play_rounds;
DROP POLICY IF EXISTS free_play_rounds_update ON public.free_play_rounds;
DROP POLICY IF EXISTS free_play_rounds_delete ON public.free_play_rounds;

CREATE POLICY free_play_rounds_select ON public.free_play_rounds
  FOR SELECT TO authenticated
  USING (public.free_play_can_read_round(id));

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
