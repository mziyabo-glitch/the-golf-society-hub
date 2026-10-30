-- Captain/ManCo: soft-remove society-scoped event participation (audit row retained).
-- RPC also strips legacy player_ids, joint event_entries, and persisted tee_group_players.

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS removed_from_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by_member_id uuid REFERENCES public.members(id);

COMMENT ON COLUMN public.event_registrations.removed_from_event_at IS
  'When set, hidden from operational event UIs. Cleared when member RSVPs in again or ManCo re-adds.';
COMMENT ON COLUMN public.event_registrations.removed_by_member_id IS
  'Member id of the ManCo user who performed removal (audit).';

CREATE INDEX IF NOT EXISTS idx_event_registrations_active
  ON public.event_registrations (event_id)
  WHERE removed_from_event_at IS NULL;

-- ---------------------------------------------------------------------------
-- ManCo removes a member from the event for the active society only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_event_participant(
  p_event_id uuid,
  p_society_id uuid,
  p_target_member_id uuid
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
    RAISE EXCEPTION 'Only Captain, Treasurer, Secretary, or Handicapper can remove participants';
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

  UPDATE public.event_registrations er
     SET removed_from_event_at = now(),
         removed_by_member_id = v_caller_id
   WHERE er.event_id = p_event_id
     AND er.member_id = p_target_member_id
     AND er.society_id = p_society_id;

  UPDATE public.events e
     SET player_ids = array_remove(e.player_ids, p_target_member_id)
   WHERE e.id = p_event_id;

  DELETE FROM public.event_entries ee
   WHERE ee.event_id = p_event_id
     AND ee.player_id = p_target_member_id;

  DELETE FROM public.tee_group_players tgp
   WHERE tgp.event_id = p_event_id
     AND tgp.player_id = p_target_member_id::text;
END
$f$;

COMMENT ON FUNCTION public.remove_event_participant(uuid, uuid, uuid) IS
  'ManCo: soft-remove registration for (event, member) in p_society_id; strip legacy player_ids, joint entries, tee sheet players.';

GRANT EXECUTE ON FUNCTION public.remove_event_participant(uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Re-activate rows when ManCo records payment or re-adds a member.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_event_paid(
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
    RAISE EXCEPTION 'No membership in this society — switch the active society in the app to manage payments for this club.';
  END IF;

  IF upper(coalesce(v_caller_role, '')) NOT IN ('CAPTAIN', 'TREASURER', 'SECRETARY', 'HANDICAPPER') THEN
    RAISE EXCEPTION 'Only Captain, Treasurer, Secretary, or Handicapper can mark payments';
  END IF;

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
        status              = CASE WHEN EXCLUDED.paid THEN 'in' ELSE public.event_registrations.status END,
        removed_from_event_at = NULL,
        removed_by_member_id  = NULL;
END
$f$;

CREATE OR REPLACE FUNCTION public.admin_add_member_to_event(
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
        marked_by_member_id = EXCLUDED.marked_by_member_id,
        removed_from_event_at = NULL,
        removed_by_member_id  = NULL;
END
$f$;

CREATE OR REPLACE FUNCTION public.submit_public_event_rsvp_member_by_email(
  p_event_id uuid,
  p_email text,
  p_status text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid;
  v_parts uuid[];
  v_member_id uuid;
  v_member_soc uuid;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_norm text := public.invite_normalize_email(p_email);
  v_cnt int;
  v_deadline timestamptz;
BEGIN
  IF p_event_id IS NULL THEN RAISE EXCEPTION 'Missing event id'; END IF;
  IF v_norm IS NULL OR position('@' in v_norm) < 2 THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
  IF v_status NOT IN ('in', 'out') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  SELECT e.society_id, e.rsvp_deadline_at INTO v_host, v_deadline
  FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  IF v_deadline IS NOT NULL AND now() > v_deadline THEN
    RAISE EXCEPTION 'rsvp_closed';
  END IF;

  SELECT coalesce(array_agg(es.society_id), ARRAY[]::uuid[])
  INTO v_parts
  FROM public.event_societies es
  WHERE es.event_id = p_event_id;

  IF coalesce(cardinality(v_parts), 0) = 0 THEN
    v_parts := ARRAY[v_host];
  END IF;

  SELECT count(*)::int INTO v_cnt
  FROM public.members m
  WHERE public.invite_normalize_email(m.email) = v_norm
    AND m.society_id = ANY (v_parts);

  IF v_cnt = 0 THEN
    RAISE EXCEPTION 'No member found with that email for this event';
  END IF;

  IF v_cnt > 1 THEN
    RAISE EXCEPTION 'multiple_members_found';
  END IF;

  SELECT m.id, m.society_id INTO v_member_id, v_member_soc
  FROM public.members m
  WHERE public.invite_normalize_email(m.email) = v_norm
    AND m.society_id = ANY(v_parts)
  ORDER BY m.society_id, m.id
  LIMIT 1;

  INSERT INTO public.event_registrations
    (society_id, event_id, member_id, status, paid, amount_paid_pence)
  VALUES
    (v_member_soc, p_event_id, v_member_id, v_status, false, 0)
  ON CONFLICT (event_id, member_id) DO UPDATE SET
    status = EXCLUDED.status,
    updated_at = now(),
    removed_from_event_at = NULL,
    removed_by_member_id  = NULL;

  RETURN v_member_id;
END;
$$;
