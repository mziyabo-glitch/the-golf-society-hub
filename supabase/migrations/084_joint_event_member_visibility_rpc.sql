-- 084: Joint-event member visibility via SECURITY DEFINER RPC (no members RLS recursion).
--
-- IMPORTANT:
-- - Reverts additive cross-society members SELECT policy from migration 083.
-- - Keeps members RLS society-scoped.
-- - Provides narrow event-scoped read model for joint tee-sheet HI visibility only.

-- Revert additive policy (if applied).
DROP POLICY IF EXISTS members_select_joint_event_coparticipants ON public.members;

-- Event-scoped member visibility for joint events.
DROP FUNCTION IF EXISTS public.get_joint_event_member_visibility(uuid);

CREATE OR REPLACE FUNCTION public.get_joint_event_member_visibility(p_event_id uuid)
RETURNS TABLE (
  member_id uuid,
  society_id uuid,
  name text,
  display_name text,
  handicap_index numeric,
  handicap numeric,
  gender text
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

  -- Viewer must belong to a society participating in this event.
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

  RETURN QUERY
  SELECT DISTINCT
    m.id AS member_id,
    m.society_id,
    m.name,
    m.display_name,
    m.handicap_index,
    m.handicap_index AS handicap,
    m.gender::text
  FROM public.event_registrations er
  JOIN public.members m
    ON m.id = er.member_id
  WHERE er.event_id = p_event_id
    -- only members from societies participating in this event
    AND EXISTS (
      SELECT 1
      FROM public.event_societies es_t
      WHERE es_t.event_id = p_event_id
        AND es_t.society_id = m.society_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_joint_event_member_visibility(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_joint_event_member_visibility(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_joint_event_member_visibility(uuid) IS
  'Returns only registered members for a joint event when caller belongs to a participating society. SECURITY DEFINER, read-only scope.';

