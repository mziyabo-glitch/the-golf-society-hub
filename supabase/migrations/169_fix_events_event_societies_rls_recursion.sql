-- Repair: migration 168 inlined event_societies in events UPDATE and event_societies DML,
-- recreating the events <-> event_societies RLS cycle fixed in 080/081.
-- Symptom: "infinite recursion detected in policy for relation events".
--
-- Pattern: SECURITY DEFINER helpers with row_security = off for cross-table checks.

-- Host society of an event belongs to the caller's societies (no RLS on events).
CREATE OR REPLACE FUNCTION public.event_host_in_my_societies(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = p_event_id
      AND e.society_id IN (SELECT public.my_society_ids())
  );
$$;

REVOKE ALL ON FUNCTION public.event_host_in_my_societies(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_host_in_my_societies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_host_in_my_societies(uuid) TO service_role;

COMMENT ON FUNCTION public.event_host_in_my_societies(uuid) IS
  'RLS helper: event host society is one of the caller''s societies. Bypasses events RLS.';

-- Caller may read an event (host society member or linked participant society member).
CREATE OR REPLACE FUNCTION public.user_can_read_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.event_host_in_my_societies(p_event_id)
      OR public.current_user_linked_to_event(p_event_id);
$$;

REVOKE ALL ON FUNCTION public.user_can_read_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_read_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_read_event(uuid) TO service_role;

COMMENT ON FUNCTION public.user_can_read_event(uuid) IS
  'RLS helper: caller can SELECT the events row (host or joint participant).';

-- Captain / Secretary / Handicapper on host OR any participating society (joint ManCo).
CREATE OR REPLACE FUNCTION public.current_user_manco_on_linked_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = p_event_id
      AND e.society_id IN (SELECT public.my_society_ids())
      AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
  )
  OR EXISTS (
    SELECT 1
    FROM public.event_societies es
    WHERE es.event_id = p_event_id
      AND es.society_id IN (SELECT public.my_society_ids())
      AND public.has_role_in_society(es.society_id, ARRAY['captain', 'secretary', 'handicapper'])
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_manco_on_linked_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_manco_on_linked_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_manco_on_linked_event(uuid) TO service_role;

COMMENT ON FUNCTION public.current_user_manco_on_linked_event(uuid) IS
  'RLS helper: ManCo on host or participating society for joint events. Bypasses events/event_societies RLS.';

-- ---------------------------------------------------------------------------
-- event_societies: break events <-> event_societies cycle (062 select, 168 DML)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS event_societies_select ON public.event_societies;
CREATE POLICY event_societies_select
  ON public.event_societies FOR SELECT TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    OR public.event_host_in_my_societies(event_id)
  );

DROP POLICY IF EXISTS event_societies_insert ON public.event_societies;
CREATE POLICY event_societies_insert
  ON public.event_societies FOR INSERT TO authenticated
  WITH CHECK (public.current_user_manco_on_linked_event(event_id));

DROP POLICY IF EXISTS event_societies_update ON public.event_societies;
CREATE POLICY event_societies_update
  ON public.event_societies FOR UPDATE TO authenticated
  USING (public.current_user_manco_on_linked_event(event_id));

DROP POLICY IF EXISTS event_societies_delete ON public.event_societies;
CREATE POLICY event_societies_delete
  ON public.event_societies FOR DELETE TO authenticated
  USING (public.current_user_manco_on_linked_event(event_id));

COMMENT ON POLICY event_societies_insert ON public.event_societies IS
  'Host or participating society ManCo (Captain, Secretary, Handicapper) may link societies to joint events.';

-- ---------------------------------------------------------------------------
-- events UPDATE: 168 inlined event_societies → recursion with event_societies_select
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS events_update_captain_secretary_handicapper ON public.events;
CREATE POLICY events_update_captain_secretary_handicapper
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (public.current_user_manco_on_linked_event(id));

COMMENT ON POLICY events_update_captain_secretary_handicapper ON public.events IS
  'Host or participating society ManCo may update event details and tee settings (joint events).';

-- ---------------------------------------------------------------------------
-- event_entries / eligibility: nested events+event_societies subqueries cycle events RLS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS event_entries_select ON public.event_entries;
CREATE POLICY event_entries_select
  ON public.event_entries FOR SELECT TO authenticated
  USING (public.user_can_read_event(event_id));

DROP POLICY IF EXISTS event_entry_eligibility_select ON public.event_entry_society_eligibility;
CREATE POLICY event_entry_eligibility_select
  ON public.event_entry_society_eligibility FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_entries ee
      WHERE ee.id = event_entry_id
        AND public.user_can_read_event(ee.event_id)
    )
  );
