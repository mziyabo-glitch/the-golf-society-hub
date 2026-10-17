-- Rivalries (sinbooks): creators can always delete/update; pending invitees can see the rivalry;
-- participants + entries visible to creator, accepted players, or pending invitees (Safari-friendly flows).

DROP POLICY IF EXISTS sinbook_participants_select ON public.sinbook_participants;
CREATE POLICY sinbook_participants_select ON public.sinbook_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sinbook_participants me
      WHERE me.sinbook_id = sinbook_participants.sinbook_id
        AND me.user_id = auth.uid()
        AND me.status IN ('pending', 'accepted')
    )
    OR EXISTS (
      SELECT 1 FROM public.sinbooks s
      WHERE s.id = sinbook_participants.sinbook_id
        AND s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS sinbooks_select ON public.sinbooks;
CREATE POLICY sinbooks_select ON public.sinbooks
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_sinbook_participant(id)
    OR EXISTS (
      SELECT 1 FROM public.sinbook_participants p
      WHERE p.sinbook_id = sinbooks.id
        AND p.user_id = auth.uid()
        AND p.status = 'pending'
    )
  );

DROP POLICY IF EXISTS sinbooks_update ON public.sinbooks;
CREATE POLICY sinbooks_update ON public.sinbooks
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_sinbook_participant(id)
  );

DROP POLICY IF EXISTS sinbooks_delete ON public.sinbooks;
CREATE POLICY sinbooks_delete ON public.sinbooks
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_sinbook_participant(id)
  );

DROP POLICY IF EXISTS sinbook_entries_select ON public.sinbook_entries;
CREATE POLICY sinbook_entries_select ON public.sinbook_entries
  FOR SELECT TO authenticated
  USING (
    public.is_sinbook_participant(sinbook_id)
    OR EXISTS (
      SELECT 1 FROM public.sinbook_participants p
      WHERE p.sinbook_id = sinbook_entries.sinbook_id
        AND p.user_id = auth.uid()
        AND p.status = 'pending'
    )
    OR EXISTS (
      SELECT 1 FROM public.sinbooks s
      WHERE s.id = sinbook_entries.sinbook_id
        AND s.created_by = auth.uid()
    )
  );
