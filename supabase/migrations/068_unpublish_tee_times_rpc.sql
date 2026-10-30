-- Unpublish tee times (clear tee_time_published_at) for joint + standard events.
-- Direct UPDATE on events is blocked for participant societies (RLS: events.society_id = host only).
-- This RPC mirrors publish_tee_times (SECURITY DEFINER) with explicit access checks.

CREATE OR REPLACE FUNCTION public.unpublish_tee_times(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

  -- Host society: captain / secretary / handicapper (same spirit as clear_tee_sheet_for_event)
  -- OR any participating society (event_societies) with same roles — needed for joint events.
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
    RAISE EXCEPTION 'Permission denied to unpublish tee times for this event';
  END IF;

  UPDATE public.events
  SET tee_time_published_at = NULL
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unpublish_tee_times(uuid) TO authenticated;

COMMENT ON FUNCTION public.unpublish_tee_times(uuid) IS
  'Clears tee_time_published_at so members no longer see published tee times. Host or participating ManCo.';
