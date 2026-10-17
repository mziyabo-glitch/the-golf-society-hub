-- 079: Placeholder / no-app members — ManCo can add a society member to an event (member_id
-- source of truth) without a client-side INSERT (RLS is self-only). Extends mark_event_paid
-- so Secretary and Handicapper can record fees (same societies as event editing).

DROP FUNCTION IF EXISTS public.mark_event_paid(uuid, uuid, uuid, boolean, integer);

CREATE FUNCTION public.mark_event_paid(
  p_event_id           uuid,
  p_society_id         uuid,
  p_target_member_id   uuid,
  p_paid               boolean,
  p_amount_pence       integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_uid               uuid := auth.uid();
  v_host_society_id   uuid;
  v_event_allows      boolean;
  v_caller_id         uuid;
  v_caller_role       text;
  v_target_member     uuid;
  v_reg_society_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT e.society_id
    INTO v_host_society_id
    FROM public.events e
   WHERE e.id = p_event_id;
  IF v_host_society_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Event must include this society (host or listed participant).
  v_event_allows :=
    p_society_id = v_host_society_id
    OR EXISTS (
      SELECT 1
        FROM public.event_societies es
       WHERE es.event_id = p_event_id
         AND es.society_id = p_society_id
    );
  IF NOT v_event_allows THEN
    RAISE EXCEPTION 'This society is not part of this event';
  END IF;

  -- Caller: exactly one row — membership in the society being managed (active society).
  SELECT m.id, m.role
    INTO v_caller_id, v_caller_role
    FROM public.members m
   WHERE m.user_id = v_uid
     AND m.society_id = p_society_id
   LIMIT 1;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'No membership in this society — switch the active society in the app to manage payments for this club.';
  END IF;

  IF upper(coalesce(v_caller_role, '')) NOT IN ('CAPTAIN', 'TREASURER', 'SECRETARY', 'HANDICAPPER') THEN
    RAISE EXCEPTION 'Only Captain, Treasurer, Secretary, or Handicapper can mark payments';
  END IF;

  -- Target: must belong to the same society (no cross-society payment control).
  -- user_id on the target is NOT required — placeholders are valid.
  SELECT m.id, m.society_id
    INTO v_target_member, v_reg_society_id
    FROM public.members m
   WHERE m.id = p_target_member_id
     AND m.society_id = p_society_id
   LIMIT 1;

  IF v_target_member IS NULL OR v_reg_society_id IS NULL THEN
    RAISE EXCEPTION 'Member not found for this society — you can only record payments for your society''s members.';
  END IF;

  INSERT INTO public.event_registrations
    (society_id, event_id, member_id, status, paid, amount_paid_pence, paid_at, marked_by_member_id)
  VALUES
    (v_reg_society_id, p_event_id, v_target_member, 'in',
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

COMMENT ON FUNCTION public.mark_event_paid(uuid, uuid, uuid, boolean, integer) IS
  'ManCo in p_society_id marks payment for a member in that society only. Target may have no app user (user_id null).';

GRANT EXECUTE ON FUNCTION public.mark_event_paid(uuid, uuid, uuid, boolean, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Add / re-confirm attendance (status in) without changing payment columns on conflict.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_add_member_to_event(uuid, uuid, uuid);

CREATE FUNCTION public.admin_add_member_to_event(
  p_event_id           uuid,
  p_society_id         uuid,
  p_target_member_id   uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_uid               uuid := auth.uid();
  v_host_society_id   uuid;
  v_event_allows      boolean;
  v_caller_id         uuid;
  v_caller_role       text;
  v_target_member     uuid;
  v_reg_society_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT e.society_id
    INTO v_host_society_id
    FROM public.events e
   WHERE e.id = p_event_id;
  IF v_host_society_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  v_event_allows :=
    p_society_id = v_host_society_id
    OR EXISTS (
      SELECT 1
        FROM public.event_societies es
       WHERE es.event_id = p_event_id
         AND es.society_id = p_society_id
    );
  IF NOT v_event_allows THEN
    RAISE EXCEPTION 'This society is not part of this event';
  END IF;

  SELECT m.id, m.role
    INTO v_caller_id, v_caller_role
    FROM public.members m
   WHERE m.user_id = v_uid
     AND m.society_id = p_society_id
   LIMIT 1;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'No membership in this society — switch the active society in the app.';
  END IF;

  IF upper(coalesce(v_caller_role, '')) NOT IN ('CAPTAIN', 'TREASURER', 'SECRETARY', 'HANDICAPPER') THEN
    RAISE EXCEPTION 'Only Captain, Treasurer, Secretary, or Handicapper can add members to an event';
  END IF;

  SELECT m.id, m.society_id
    INTO v_target_member, v_reg_society_id
    FROM public.members m
   WHERE m.id = p_target_member_id
     AND m.society_id = p_society_id
   LIMIT 1;

  IF v_target_member IS NULL OR v_reg_society_id IS NULL THEN
    RAISE EXCEPTION 'Member not found for this society.';
  END IF;

  INSERT INTO public.event_registrations
    (society_id, event_id, member_id, status, paid, amount_paid_pence, paid_at, marked_by_member_id)
  VALUES
    (v_reg_society_id, p_event_id, v_target_member, 'in',
     false,
     0,
     null,
     v_caller_id)
  ON CONFLICT (event_id, member_id) DO UPDATE
    SET status              = 'in',
        marked_by_member_id = EXCLUDED.marked_by_member_id;
END
$f$;

COMMENT ON FUNCTION public.admin_add_member_to_event(uuid, uuid, uuid) IS
  'ManCo: ensure event_registrations row for member (status in). Preserves paid/amount on existing row.';

GRANT EXECUTE ON FUNCTION public.admin_add_member_to_event(uuid, uuid, uuid) TO authenticated;
