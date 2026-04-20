-- Public event member RSVP: require authenticated user linked to the matched member row.
-- Email-only / unlinked roster rows cannot write event_registrations.
-- Add resolve RPC for UX (not_found / unlinked / linked / ambiguous) and host join code on invite summary.

-- ---------------------------------------------------------------------------
-- 1) Invite summary: include host society join code (for join deep links)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_public_event_invite_summary(uuid);

CREATE OR REPLACE FUNCTION public.get_public_event_invite_summary(p_event_id uuid)
RETURNS TABLE (
  event_id uuid,
  name text,
  date text,
  course_name text,
  society_name text,
  host_society_id uuid,
  participant_society_ids uuid[],
  rsvp_deadline_at timestamptz,
  rsvp_open boolean,
  host_society_join_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_row public.events%ROWTYPE;
  v_soc_name text;
  v_join_code text;
  v_parts uuid[];
  v_open boolean;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Missing event id';
  END IF;

  SELECT * INTO v_row FROM public.events e WHERE e.id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  SELECT s.name::text, s.join_code::text
  INTO v_soc_name, v_join_code
  FROM public.societies s
  WHERE s.id = v_row.society_id;

  SELECT coalesce(array_agg(es.society_id ORDER BY es.society_id), ARRAY[]::uuid[])
  INTO v_parts
  FROM public.event_societies es
  WHERE es.event_id = p_event_id;

  IF coalesce(cardinality(v_parts), 0) = 0 THEN
    v_parts := ARRAY[v_row.society_id];
  END IF;

  v_open := (v_row.rsvp_deadline_at IS NULL OR now() <= v_row.rsvp_deadline_at);

  RETURN QUERY SELECT
    v_row.id,
    v_row.name,
    coalesce(v_row.date::text, ''),
    coalesce(v_row.course_name, ''),
    coalesce(v_soc_name, 'Golf Society'),
    v_row.society_id,
    v_parts,
    v_row.rsvp_deadline_at,
    v_open,
    nullif(trim(both from coalesce(v_join_code, '')), '');
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_event_invite_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_event_invite_summary(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Read-only resolve: email vs event participating societies (no writes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_public_event_rsvp_member_email_status(
  p_event_id uuid,
  p_email text
)
RETURNS TABLE (
  status text,
  member_id uuid,
  society_id uuid,
  user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_host uuid;
  v_parts uuid[];
  v_norm text := public.invite_normalize_email(p_email);
  v_cnt int;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Missing event id';
  END IF;
  IF v_norm IS NULL OR position('@' in v_norm) < 2 THEN
    RAISE EXCEPTION 'Enter a valid email';
  END IF;

  SELECT e.society_id INTO v_host FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL THEN
    RAISE EXCEPTION 'rsvp_event_not_found';
  END IF;

  SELECT coalesce(array_agg(es.society_id ORDER BY es.society_id), ARRAY[]::uuid[])
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
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  IF v_cnt > 1 THEN
    RETURN QUERY SELECT 'ambiguous'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN m.user_id IS NULL THEN 'unlinked' ELSE 'linked' END::text,
    m.id,
    m.society_id,
    m.user_id
  FROM public.members m
  WHERE public.invite_normalize_email(m.email) = v_norm
    AND m.society_id = ANY (v_parts)
  ORDER BY m.society_id, m.id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_public_event_rsvp_member_email_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_public_event_rsvp_member_email_status(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Member RSVP write: authenticated + member.user_id = auth.uid()
-- ---------------------------------------------------------------------------
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
  v_member_user uuid;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_norm text := public.invite_normalize_email(p_email);
  v_cnt int;
  v_deadline timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'rsvp_auth_required';
  END IF;

  IF p_event_id IS NULL THEN RAISE EXCEPTION 'Missing event id'; END IF;
  IF v_norm IS NULL OR position('@' in v_norm) < 2 THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
  IF v_status NOT IN ('in', 'out') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  SELECT e.society_id, e.rsvp_deadline_at INTO v_host, v_deadline
  FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL THEN RAISE EXCEPTION 'rsvp_event_not_found'; END IF;

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
    RAISE EXCEPTION 'rsvp_member_not_found';
  END IF;

  IF v_cnt > 1 THEN
    RAISE EXCEPTION 'multiple_members_found';
  END IF;

  SELECT m.id, m.society_id, m.user_id
  INTO v_member_id, v_member_soc, v_member_user
  FROM public.members m
  WHERE public.invite_normalize_email(m.email) = v_norm
    AND m.society_id = ANY (v_parts)
  ORDER BY m.society_id, m.id
  LIMIT 1;

  IF v_member_user IS NULL THEN
    RAISE EXCEPTION 'rsvp_member_unlinked';
  END IF;

  IF v_member_user <> auth.uid() THEN
    RAISE EXCEPTION 'rsvp_not_allowed';
  END IF;

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

REVOKE ALL ON FUNCTION public.submit_public_event_rsvp_member_by_email(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_event_rsvp_member_by_email(uuid, text, text) TO anon, authenticated;
