-- 054_clear_tee_sheet_rpc.sql
-- RPC to clear tee groups and players for an event.
-- Runs as SECURITY DEFINER to avoid RLS blocking the delete.
-- Permission is checked before performing the delete.

CREATE OR REPLACE FUNCTION public.clear_tee_sheet_for_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user has permission (captain, secretary, handicapper)
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event_id
      AND e.society_id IN (SELECT public.my_society_ids())
      AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
  ) THEN
    RAISE EXCEPTION 'Permission denied to clear tee sheet for this event';
  END IF;

  DELETE FROM public.tee_group_players WHERE event_id = p_event_id;
  DELETE FROM public.tee_groups WHERE event_id = p_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_tee_sheet_for_event(uuid) TO authenticated;

COMMENT ON FUNCTION public.clear_tee_sheet_for_event(uuid) IS
  'Clears tee_groups and tee_group_players for an event. Requires captain/secretary/handicapper role.';
