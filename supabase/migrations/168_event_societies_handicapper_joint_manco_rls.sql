-- event_societies RLS (062) allowed only Captain/Secretary on the host society.
-- Handicappers (and participant-society ManCo) were blocked when joint event saves
-- re-upserted event_societies. Align with joint tee-sheet RPCs (069, 077).

DROP POLICY IF EXISTS event_societies_insert ON public.event_societies;
CREATE POLICY event_societies_insert
  ON public.event_societies FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
    OR EXISTS (
      SELECT 1 FROM public.event_societies es
      WHERE es.event_id = event_societies.event_id
        AND es.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(es.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

DROP POLICY IF EXISTS event_societies_update ON public.event_societies;
CREATE POLICY event_societies_update
  ON public.event_societies FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_societies.event_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
    OR EXISTS (
      SELECT 1 FROM public.event_societies es
      WHERE es.event_id = event_societies.event_id
        AND es.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(es.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

DROP POLICY IF EXISTS event_societies_delete ON public.event_societies;
CREATE POLICY event_societies_delete
  ON public.event_societies FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_societies.event_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
    OR EXISTS (
      SELECT 1 FROM public.event_societies es
      WHERE es.event_id = event_societies.event_id
        AND es.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(es.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

-- Joint events: participant-society ManCo may update tee settings on the master events row.
DROP POLICY IF EXISTS events_update_captain_secretary_handicapper ON public.events;
CREATE POLICY events_update_captain_secretary_handicapper
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    (
      society_id IN (SELECT public.my_society_ids())
      AND public.has_role_in_society(society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
    OR EXISTS (
      SELECT 1 FROM public.event_societies es
      WHERE es.event_id = events.id
        AND es.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(es.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

COMMENT ON POLICY event_societies_insert ON public.event_societies IS
  'Host or participating society ManCo (Captain, Secretary, Handicapper) may link societies to joint events.';

COMMENT ON POLICY events_update_captain_secretary_handicapper ON public.events IS
  'Host or participating society ManCo may update event details and tee settings (joint events).';
