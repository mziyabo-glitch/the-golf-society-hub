-- 039_rename_publish_tee_times_param.sql
-- Rename p_start_time → p_start for client consistency.

DROP FUNCTION IF EXISTS public.publish_tee_times(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.publish_tee_times(
  p_event_id uuid,
  p_start    text,
  p_interval integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

  UPDATE public.events
  SET tee_time_start        = COALESCE(NULLIF(TRIM(p_start), ''), '08:00'),
      tee_time_interval     = COALESCE(p_interval, 10),
      tee_time_published_at = now()
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_tee_times(uuid, text, integer)
  TO authenticated;

COMMENT ON FUNCTION public.publish_tee_times IS
  'Publish tee times for an event. Sets start, interval, and published_at server-side.';

NOTIFY pgrst, 'reload schema';
