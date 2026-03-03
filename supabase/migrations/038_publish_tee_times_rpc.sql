-- 038_publish_tee_times_rpc.sql
-- 1. Ensure tee-time columns exist on events (idempotent).
-- 2. Add DB trigger so updated_at is set automatically on every UPDATE
--    (clients no longer need to send it).
-- 3. Create publish_tee_times RPC that sets tee_time_start,
--    tee_time_interval and tee_time_published_at server-side.
-- 4. Notify PostgREST to reload its schema cache.

-- ============================================================================
-- 1. Ensure columns
-- ============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS tee_time_start       text,
  ADD COLUMN IF NOT EXISTS tee_time_interval    integer,
  ADD COLUMN IF NOT EXISTS tee_time_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz DEFAULT now();

-- ============================================================================
-- 2. Auto-set updated_at via trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_updated_at ON public.events;

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. publish_tee_times RPC
-- ============================================================================

DROP FUNCTION IF EXISTS public.publish_tee_times(uuid, text, integer);

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
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

  UPDATE public.events
  SET tee_time_start        = COALESCE(NULLIF(TRIM(p_start_time), ''), '08:00'),
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

-- ============================================================================
-- 4. Notify PostgREST to pick up new columns / function
-- ============================================================================

NOTIFY pgrst, 'reload schema';
