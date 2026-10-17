-- Joint participant ManCo could only SELECT their own event_societies row (169 policy).
-- getJointMetaForEventIds then counted linkedSocietyCount = 1 → is_joint_event false.
-- Tee sheet Save Draft wrote member pairings to tee_groups (standard path) while reload
-- for host used event_entries (joint path), or regenerated from the paid pool when empty.
--
-- Also align tee_sheet_player_policy (166) with can_manage_event_tee_sheet: host-only +
-- captain/secretary/handicapper blocked joint participant ManCo and treasurer.
--
-- Ensure helper exists (defined in 160; may be missing if 160 was skipped on deploy).
CREATE OR REPLACE FUNCTION public.can_manage_event_tee_sheet(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event_id
      AND (
        (
          e.society_id IN (SELECT public.my_society_ids())
          AND public.has_role_in_society(
            e.society_id,
            ARRAY['captain', 'secretary', 'treasurer', 'handicapper']
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.event_societies es
          WHERE es.event_id = p_event_id
            AND es.society_id IN (SELECT public.my_society_ids())
            AND public.has_role_in_society(
              es.society_id,
              ARRAY['captain', 'secretary', 'treasurer', 'handicapper']
            )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_event_tee_sheet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_event_tee_sheet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_event_tee_sheet(uuid) TO service_role;

COMMENT ON FUNCTION public.can_manage_event_tee_sheet(uuid) IS
  'Host or joint-participant ManCo (captain, secretary, treasurer, handicapper) may save tee sheet drafts.';

DROP POLICY IF EXISTS event_societies_select ON public.event_societies;
CREATE POLICY event_societies_select
  ON public.event_societies FOR SELECT TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    OR public.event_host_in_my_societies(event_id)
    OR public.current_user_linked_to_event(event_id)
  );

COMMENT ON POLICY event_societies_select ON public.event_societies IS
  'Host, own society row, or any linked participant may read all event_societies for the event (joint meta).';

DROP POLICY IF EXISTS tee_sheet_player_policy_select ON public.tee_sheet_player_policy;
DROP POLICY IF EXISTS tee_sheet_player_policy_insert ON public.tee_sheet_player_policy;
DROP POLICY IF EXISTS tee_sheet_player_policy_update ON public.tee_sheet_player_policy;
DROP POLICY IF EXISTS tee_sheet_player_policy_delete ON public.tee_sheet_player_policy;

CREATE POLICY tee_sheet_player_policy_select ON public.tee_sheet_player_policy FOR SELECT TO authenticated
  USING (public.user_can_read_event(event_id));

CREATE POLICY tee_sheet_player_policy_insert ON public.tee_sheet_player_policy FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_event_tee_sheet(event_id));

CREATE POLICY tee_sheet_player_policy_update ON public.tee_sheet_player_policy FOR UPDATE TO authenticated
  USING (public.can_manage_event_tee_sheet(event_id));

CREATE POLICY tee_sheet_player_policy_delete ON public.tee_sheet_player_policy FOR DELETE TO authenticated
  USING (public.can_manage_event_tee_sheet(event_id));

NOTIFY pgrst, 'reload schema';
