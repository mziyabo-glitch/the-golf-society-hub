-- Allow ManCo from participating societies (joint events) to clear tee_groups, not only host.

CREATE OR REPLACE FUNCTION public.clear_tee_sheet_for_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event_id
      AND (
        (
          e.society_id IN (SELECT public.my_society_ids())
          AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
        )
        OR EXISTS (
          SELECT 1 FROM public.event_societies es
          WHERE es.event_id = p_event_id
            AND es.society_id IN (SELECT public.my_society_ids())
            AND public.has_role_in_society(es.society_id, ARRAY['captain', 'secretary', 'handicapper'])
        )
      )
  ) THEN
    RAISE EXCEPTION 'Permission denied to clear tee sheet for this event';
  END IF;

  DELETE FROM public.tee_group_players WHERE event_id = p_event_id;
  DELETE FROM public.tee_groups WHERE event_id = p_event_id;
END;
$$;

COMMENT ON FUNCTION public.clear_tee_sheet_for_event(uuid) IS
  'Clears tee_groups and tee_group_players. Host or participating society ManCo (joint events).';
