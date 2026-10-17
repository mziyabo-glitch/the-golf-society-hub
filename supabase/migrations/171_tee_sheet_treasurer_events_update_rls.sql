-- Treasurer can save tee sheet drafts (can_manage_event_tee_sheet, 160) but
-- events UPDATE used current_user_manco_on_linked_event without treasurer →
-- updateEvent for tee_time_start / player_ids failed after tee_groups wrote.

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
      AND public.has_role_in_society(
        e.society_id,
        ARRAY['captain', 'secretary', 'treasurer', 'handicapper']
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.event_societies es
    WHERE es.event_id = p_event_id
      AND es.society_id IN (SELECT public.my_society_ids())
      AND public.has_role_in_society(
        es.society_id,
        ARRAY['captain', 'secretary', 'treasurer', 'handicapper']
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_manco_on_linked_event(uuid) IS
  'RLS helper: ManCo (captain, secretary, treasurer, handicapper) on host or participating society. Aligns with can_manage_event_tee_sheet.';

NOTIFY pgrst, 'reload schema';
