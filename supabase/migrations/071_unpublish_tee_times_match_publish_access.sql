-- unpublish_tee_times had stricter checks than publish_tee_times (which has no in-function
-- permission guard). Anyone who could call publish could not unpublish (e.g. participant
-- not in event_societies, or role edge cases). Align unpublish with publish: SECURITY DEFINER
-- UPDATE only, authenticated via GRANT — same effective access as publish_tee_times.

CREATE OR REPLACE FUNCTION public.unpublish_tee_times(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

  UPDATE public.events
  SET tee_time_published_at = NULL
  WHERE id = p_event_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unpublish_tee_times(uuid) TO authenticated;

COMMENT ON FUNCTION public.unpublish_tee_times(uuid) IS
  'Clears tee_time_published_at (same caller access model as publish_tee_times).';
