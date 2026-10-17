-- Deterministic member row when email matches exactly one participating-society member.
-- (v_cnt = 1 already; ORDER BY avoids undefined LIMIT 1 behaviour if constraints drift.)

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
    AND m.society_id = ANY (v_parts)
  ORDER BY m.society_id, m.id
  LIMIT 1;

  INSERT INTO public.event_registrations
    (society_id, event_id, member_id, status, paid, amount_paid_pence)
  VALUES
    (v_member_soc, p_event_id, v_member_id, v_status, false, 0)
  ON CONFLICT (event_id, member_id) DO UPDATE SET
    status = EXCLUDED.status,
    updated_at = now();

  RETURN v_member_id;
END;
$$;
