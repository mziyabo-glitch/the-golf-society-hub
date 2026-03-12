-- 052_publish_tee_times_time_format.sql
-- Fix tee_time_start for TIME WITHOUT TIME ZONE: ensure HH:MM:SS format.
-- The column may be TIME type; text like '11:12' fails, '11:12:00' works.

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
DECLARE
  v_start text;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

  -- Normalize to HH:MM:SS for TIME column (pad HH:MM -> HH:MM:00)
  v_start := COALESCE(NULLIF(TRIM(p_start), ''), '08:00:00');
  IF length(v_start) = 5 AND v_start ~ '^\d{2}:\d{2}$' THEN
    v_start := v_start || ':00';
  ELSIF length(v_start) = 4 AND v_start ~ '^\d{1,2}:\d{2}$' THEN
    v_start := '0' || v_start || ':00';
  ELSIF v_start !~ '^\d{2}:\d{2}:\d{2}$' THEN
    v_start := '08:00:00';
  END IF;

  -- Cast to time for TIME column; v_start is HH:MM:SS
  UPDATE public.events
  SET tee_time_start        = v_start::time,
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

COMMENT ON FUNCTION public.publish_tee_times(uuid, text, integer) IS
  'Publish tee times. Accepts HH:MM or HH:MM:SS; stores as TIME.';
