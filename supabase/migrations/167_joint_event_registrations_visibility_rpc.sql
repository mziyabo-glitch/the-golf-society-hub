-- 167: Joint-event registration visibility via SECURITY DEFINER RPC.
-- Participating-society members can read all event_registrations for the event
-- (cross-society signups) without widening event_registrations SELECT RLS.

DROP FUNCTION IF EXISTS public.get_joint_event_registrations(uuid);

CREATE OR REPLACE FUNCTION public.get_joint_event_registrations(p_event_id uuid)
RETURNS TABLE (
  id uuid,
  society_id uuid,
  event_id uuid,
  member_id uuid,
  status text,
  paid boolean,
  amount_paid_pence integer,
  paid_at timestamptz,
  marked_by_member_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  removed_from_event_at timestamptz,
  removed_by_member_id uuid,
  user_id uuid,
  member_email text,
  member_name text,
  member_display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Missing event id';
  END IF;

  -- Viewer must belong to a society participating in this joint event.
  IF NOT EXISTS (
    SELECT 1
    FROM public.members vm
    JOIN public.event_societies es
      ON es.society_id = vm.society_id
    WHERE es.event_id = p_event_id
      AND vm.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not authorized for this event';
  END IF;

  -- Event must be joint (2+ participating societies).
  IF (
    SELECT COUNT(DISTINCT es2.society_id)
    FROM public.event_societies es2
    WHERE es2.event_id = p_event_id
  ) < 2 THEN
    RAISE EXCEPTION 'Not a joint event';
  END IF;

  RETURN QUERY
  SELECT
    er.id,
    er.society_id,
    er.event_id,
    er.member_id,
    er.status,
    er.paid,
    er.amount_paid_pence,
    er.paid_at,
    er.marked_by_member_id,
    er.created_at,
    er.updated_at,
    er.removed_from_event_at,
    er.removed_by_member_id,
    m.user_id,
    m.email AS member_email,
    m.name AS member_name,
    m.display_name AS member_display_name
  FROM public.event_registrations er
  JOIN public.members m
    ON m.id = er.member_id
  WHERE er.event_id = p_event_id
    AND EXISTS (
      SELECT 1
      FROM public.event_societies es_t
      WHERE es_t.event_id = p_event_id
        AND es_t.society_id = m.society_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_joint_event_registrations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_joint_event_registrations(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_joint_event_registrations(uuid) IS
  'Joint events: all participating-society event_registrations for callers in a participating society. SECURITY DEFINER read-only.';
