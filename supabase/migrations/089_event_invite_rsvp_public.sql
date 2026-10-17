-- Public event RSVP invite: summary for share links + guest/member-by-email submission.
-- Guest rows use sex = 'male' as a neutral placeholder when unknown (captain can edit later).

-- ---------------------------------------------------------------------------
-- 1) Public read: event teaser for invite screen (no auth)
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
  participant_society_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_row public.events%ROWTYPE;
  v_soc_name text;
  v_parts uuid[];
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Missing event id';
  END IF;

  SELECT * INTO v_row FROM public.events e WHERE e.id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  SELECT s.name INTO v_soc_name
  FROM public.societies s
  WHERE s.id = v_row.society_id;

  SELECT coalesce(array_agg(es.society_id ORDER BY es.society_id), ARRAY[]::uuid[])
  INTO v_parts
  FROM public.event_societies es
  WHERE es.event_id = p_event_id;

  IF coalesce(cardinality(v_parts), 0) = 0 THEN
    v_parts := ARRAY[v_row.society_id];
  END IF;

  RETURN QUERY SELECT
    v_row.id,
    v_row.name,
    coalesce(v_row.date::text, ''),
    coalesce(v_row.course_name, ''),
    coalesce(v_soc_name, 'Golf Society'),
    v_row.society_id,
    v_parts;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_event_invite_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_event_invite_summary(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Guest RSVP (no auth) — inserts event_guests; bypasses member-only RLS
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_public_event_rsvp_guest(uuid, text);

CREATE OR REPLACE FUNCTION public.submit_public_event_rsvp_guest(
  p_event_id uuid,
  p_name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid;
  v_clean text := trim(coalesce(p_name, ''));
  v_id uuid;
BEGIN
  IF p_event_id IS NULL THEN RAISE EXCEPTION 'Missing event id'; END IF;
  IF length(v_clean) < 2 THEN RAISE EXCEPTION 'Please enter your name'; END IF;

  SELECT e.society_id INTO v_host FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  INSERT INTO public.event_guests (society_id, event_id, name, sex)
  VALUES (v_host, p_event_id, v_clean, 'male')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_event_rsvp_guest(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_event_rsvp_guest(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Member RSVP by email (no auth) — matches member in host or joint societies
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_public_event_rsvp_member_by_email(uuid, text, text);

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
  v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  IF p_event_id IS NULL THEN RAISE EXCEPTION 'Missing event id'; END IF;
  IF v_email = '' OR position('@' in v_email) < 2 THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
  IF v_status NOT IN ('in', 'out') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  SELECT e.society_id INTO v_host FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  SELECT coalesce(array_agg(es.society_id), ARRAY[]::uuid[])
  INTO v_parts
  FROM public.event_societies es
  WHERE es.event_id = p_event_id;

  IF coalesce(cardinality(v_parts), 0) = 0 THEN
    v_parts := ARRAY[v_host];
  END IF;

  SELECT m.id, m.society_id INTO v_member_id, v_member_soc
  FROM public.members m
  WHERE lower(trim(coalesce(m.email, ''))) = v_email
    AND m.society_id = ANY (v_parts)
  ORDER BY CASE WHEN m.society_id = v_host THEN 0 ELSE 1 END, m.created_at ASC
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'No member found with that email for this event';
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
