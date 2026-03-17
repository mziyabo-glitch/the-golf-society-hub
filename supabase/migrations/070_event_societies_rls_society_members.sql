-- 070_event_societies_rls_society_members.sql
-- Replace event_societies RLS policies that query event_societies with society_members (members) references.
-- Avoids RLS recursion and uses explicit society membership checks.

-- 1. Create society_members view (alias for members - society membership)
CREATE OR REPLACE VIEW public.society_members AS
SELECT id, society_id, user_id, role
FROM public.members;

COMMENT ON VIEW public.society_members IS 'Society membership - used in RLS to avoid querying event_societies from within policies.';

-- 2. Helper: participating society IDs for an event (SECURITY DEFINER - reads event_societies internally)
CREATE OR REPLACE FUNCTION public.event_participating_society_ids(_event_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT society_id FROM public.events WHERE id = _event_id AND society_id IS NOT NULL
  UNION
  SELECT society_id FROM public.event_societies WHERE event_id = _event_id;
$$;

GRANT EXECUTE ON FUNCTION public.event_participating_society_ids(uuid) TO authenticated;

COMMENT ON FUNCTION public.event_participating_society_ids(uuid) IS 'Returns society IDs participating in an event. Used in RLS to avoid policies querying event_societies directly.';

-- 3. Replace event_societies RLS policies - use society_members instead of my_society_ids/event_societies

DROP POLICY IF EXISTS event_societies_select ON public.event_societies;
CREATE POLICY event_societies_select ON public.event_societies FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.society_members sm WHERE sm.society_id = event_societies.society_id AND sm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS event_societies_insert ON public.event_societies;
CREATE POLICY event_societies_insert ON public.event_societies FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.society_members sm ON sm.society_id = e.society_id AND sm.user_id = auth.uid()
      WHERE e.id = event_id
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

DROP POLICY IF EXISTS event_societies_update ON public.event_societies;
CREATE POLICY event_societies_update ON public.event_societies FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.society_members sm ON sm.society_id = e.society_id AND sm.user_id = auth.uid()
      WHERE e.id = event_id
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.society_members sm ON sm.society_id = e.society_id AND sm.user_id = auth.uid()
      WHERE e.id = event_id
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

DROP POLICY IF EXISTS event_societies_delete ON public.event_societies;
CREATE POLICY event_societies_delete ON public.event_societies FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.society_members sm ON sm.society_id = e.society_id AND sm.user_id = auth.uid()
      WHERE e.id = event_id
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

-- 4. Replace events/tee_groups/tee_group_players policies that query event_societies - use society_members + helper
DROP POLICY IF EXISTS events_select_society ON public.events;
CREATE POLICY events_select_society ON public.events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.society_members sm WHERE sm.user_id = auth.uid() AND sm.society_id = events.society_id)
    OR EXISTS (
      SELECT 1 FROM public.society_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.society_id IN (SELECT public.event_participating_society_ids(events.id))
    )
  );

DROP POLICY IF EXISTS tee_groups_select ON public.tee_groups;
CREATE POLICY tee_groups_select ON public.tee_groups FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.society_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.society_id IN (SELECT public.event_participating_society_ids(tee_groups.event_id))
    )
  );

DROP POLICY IF EXISTS tee_group_players_select ON public.tee_group_players;
CREATE POLICY tee_group_players_select ON public.tee_group_players FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.society_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.society_id IN (SELECT public.event_participating_society_ids(tee_group_players.event_id))
    )
  );
