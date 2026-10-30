-- Repair: deployment of an earlier 080 shape inlined EXISTS (event_societies) on events,
-- which cycles with event_societies_select → "infinite recursion detected in policy for relation events".
-- Idempotent: safe if 080 already created this function + policy.

CREATE OR REPLACE FUNCTION public.current_user_linked_to_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_societies es
    WHERE es.event_id = p_event_id
      AND es.society_id IN (SELECT public.my_society_ids())
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_linked_to_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_linked_to_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_linked_to_event(uuid) TO service_role;

DROP POLICY IF EXISTS events_select_in_society ON public.events;

CREATE POLICY events_select_in_society
  ON public.events
  FOR SELECT
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    OR public.current_user_linked_to_event(id)
  );
