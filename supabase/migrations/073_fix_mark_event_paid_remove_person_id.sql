-- 072 referenced public.members.person_id, which does not exist in this schema.
-- Recreate mark_event_paid: cross-society member resolution via user_id + email only.

DROP FUNCTION IF EXISTS public.mark_event_paid(uuid, uuid, boolean, integer);

CREATE FUNCTION public.mark_event_paid(
  p_event_id           uuid,
  p_target_member_id   uuid,
  p_paid               boolean,
  p_amount_pence       integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_uid            uuid := auth.uid();
  v_society_id     uuid;
  v_caller_id      uuid;
  v_caller_role    text;
  v_target_member  uuid := p_target_member_id;
  v_src_user_id    uuid;
  v_src_email      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT e.society_id
    INTO v_society_id
    FROM public.events e
   WHERE e.id = p_event_id;
  IF v_society_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  SELECT m.id, m.role
    INTO v_caller_id, v_caller_role
    FROM public.members m
   WHERE m.society_id = v_society_id
     AND m.user_id = v_uid
   LIMIT 1;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not a member of this society';
  END IF;
  IF upper(coalesce(v_caller_role, '')) NOT IN ('CAPTAIN', 'TREASURER') THEN
    RAISE EXCEPTION 'Only Captain or Treasurer can mark payments';
  END IF;

  -- If incoming member_id is not in event society, map to equivalent host-society row (user_id or email).
  IF NOT EXISTS (
    SELECT 1
      FROM public.members
     WHERE id = v_target_member
       AND society_id = v_society_id
  ) THEN
    SELECT m.user_id,
           lower(nullif(trim(m.email), ''))
      INTO v_src_user_id, v_src_email
      FROM public.members m
     WHERE m.id = p_target_member_id
     LIMIT 1;

    SELECT m2.id
      INTO v_target_member
      FROM public.members m2
     WHERE m2.society_id = v_society_id
       AND (
         (v_src_user_id IS NOT NULL AND m2.user_id = v_src_user_id)
         OR (v_src_email IS NOT NULL AND lower(nullif(trim(m2.email), '')) = v_src_email)
       )
     ORDER BY m2.created_at
     LIMIT 1;
  END IF;

  IF v_target_member IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.members
     WHERE id = v_target_member
       AND society_id = v_society_id
  ) THEN
    RAISE EXCEPTION 'Target member not found in this society';
  END IF;

  INSERT INTO public.event_registrations
    (society_id, event_id, member_id, status, paid, amount_paid_pence, paid_at, marked_by_member_id)
  VALUES
    (v_society_id, p_event_id, v_target_member, 'in',
     p_paid,
     CASE WHEN p_paid THEN coalesce(p_amount_pence, 0) ELSE 0 END,
     CASE WHEN p_paid THEN now() ELSE null END,
     v_caller_id)
  ON CONFLICT (event_id, member_id) DO UPDATE
    SET paid                = EXCLUDED.paid,
        amount_paid_pence   = EXCLUDED.amount_paid_pence,
        paid_at             = EXCLUDED.paid_at,
        marked_by_member_id = EXCLUDED.marked_by_member_id,
        status              = CASE WHEN EXCLUDED.paid THEN 'in' ELSE public.event_registrations.status END;
END
$f$;

COMMENT ON FUNCTION public.mark_event_paid(uuid, uuid, boolean, integer) IS
  'Captain/Treasurer: set paid. Resolves cross-society member rows to event-society member via user_id/email; paid=true forces status=in.';

GRANT EXECUTE ON FUNCTION public.mark_event_paid(uuid, uuid, boolean, integer) TO authenticated;
