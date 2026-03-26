-- 083: Allow cross-society member SELECT only within joint-event participant context.
--
-- Goal:
-- - Keep default society isolation.
-- - Add a narrow READ-ONLY path so a viewer can read member rows (incl. handicap_index)
--   for players co-participating in the same JOINT event.
--
-- Safety:
-- - SELECT only (no INSERT/UPDATE/DELETE changes).
-- - Requires both viewer member and target member to be registered in the same event.
-- - Event must be joint (>=2 participating societies in event_societies).

DROP POLICY IF EXISTS members_select_joint_event_coparticipants ON public.members;

CREATE POLICY members_select_joint_event_coparticipants
  ON public.members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_registrations er_viewer
      JOIN public.event_registrations er_target
        ON er_target.event_id = er_viewer.event_id
      WHERE
        er_target.member_id = public.members.id
        AND er_viewer.member_id IN (
          SELECT m_view.id
          FROM public.members m_view
          WHERE m_view.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1
          FROM public.event_societies es_a
          JOIN public.event_societies es_b
            ON es_b.event_id = es_a.event_id
           AND es_b.society_id <> es_a.society_id
          WHERE es_a.event_id = er_viewer.event_id
        )
    )
  );

COMMENT ON POLICY members_select_joint_event_coparticipants ON public.members IS
  'SELECT-only: allows viewing member rows for co-participants in the same JOINT event; preserves normal society isolation elsewhere.';

