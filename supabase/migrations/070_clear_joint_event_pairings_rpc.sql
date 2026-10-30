-- Joint events: participant ManCo cannot UPDATE event_entries (RLS: host society only).
-- Clear pairings via SECURITY DEFINER with same access model as unpublish_tee_times.

CREATE OR REPLACE FUNCTION public.clear_joint_event_pairings(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

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
    RAISE EXCEPTION 'Permission denied to clear joint event pairings for this event';
  END IF;

  UPDATE public.event_entries
  SET pairing_group = NULL,
      pairing_position = NULL
  WHERE event_id = p_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_joint_event_pairings(uuid) TO authenticated;

COMMENT ON FUNCTION public.clear_joint_event_pairings(uuid) IS
  'Clears pairing_group/position for a joint event. Host or participating ManCo.';
