-- 173_fix_publish_tee_times_time_cast.sql
-- ROOT CAUSE of "Publish button does nothing":
--   events.tee_time_start is `time without time zone`, but migration 160 recreated
--   publish_tee_times (to add the can_manage_event_tee_sheet permission check) using a
--   plain TEXT assignment `tee_time_start = COALESCE(NULLIF(TRIM(p_start_time), ''), '08:00')`.
--   Assigning text to a `time` column raises 42804:
--     "column tee_time_start is of type time without time zone but expression is of type text".
--   So every publish RPC call threw, leaving tee_time_published_at unset.
--   Migration 052 had already fixed this with a ::time cast, but 160 silently reverted it.
--
-- FIX: keep the 160 permission check (captain/secretary/treasurer/handicapper on host or
--      participating society — joint events included) AND restore the 052 time normalization
--      so HH:MM or HH:MM:SS text is cast to the TIME column.

CREATE OR REPLACE FUNCTION public.publish_tee_times(
  p_event_id   uuid,
  p_start_time text,
  p_interval   integer
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

  IF NOT public.can_manage_event_tee_sheet(p_event_id) THEN
    RAISE EXCEPTION 'Permission denied to publish tee times for this event';
  END IF;

  -- Normalize to HH:MM:SS for the TIME column (pad HH:MM -> HH:MM:00).
  v_start := COALESCE(NULLIF(TRIM(p_start_time), ''), '08:00:00');
  IF v_start ~ '^\d{1,2}:\d{2}$' THEN
    v_start := lpad(v_start, 5, '0') || ':00';
  ELSIF v_start !~ '^\d{2}:\d{2}:\d{2}$' THEN
    v_start := '08:00:00';
  END IF;

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

GRANT EXECUTE ON FUNCTION public.publish_tee_times(uuid, text, integer) TO authenticated;

COMMENT ON FUNCTION public.publish_tee_times(uuid, text, integer) IS
  'Publish tee times. ManCo-only (can_manage_event_tee_sheet). Accepts HH:MM or HH:MM:SS; stores as TIME.';

NOTIFY pgrst, 'reload schema';
