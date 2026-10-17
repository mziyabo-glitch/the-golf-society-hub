-- Polish public event RSVP: nullable guest sex, RSVP deadline, stricter member match, RPC refresh.

-- ---------------------------------------------------------------------------
-- 1) Schema: guest sex optional (no default gender)
-- ---------------------------------------------------------------------------
ALTER TABLE public.event_guests
  DROP CONSTRAINT IF EXISTS event_guests_sex_check;

ALTER TABLE public.event_guests
  ALTER COLUMN sex DROP NOT NULL;

ALTER TABLE public.event_guests
  ADD CONSTRAINT event_guests_sex_check
  CHECK (sex IS NULL OR sex IN ('male', 'female'));

COMMENT ON COLUMN public.event_guests.sex IS
  'Optional until organiser sets; public invite guests insert with NULL.';

-- ---------------------------------------------------------------------------
-- 2) events.rsvp_deadline_at — when set, public invite submissions close after this instant (UTC stored as timestamptz).
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_deadline_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3) Email normalisation for invite matching (trim + lower)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_normalize_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    lower(trim(both from coalesce(p_email, ''))),
    ''
  );
$$;

-- ---------------------------------------------------------------------------
-- 4) Public invite summary (add deadline + open flag)
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
  rsvp_open boolean
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
  v_open boolean;
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
    v_open;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_event_invite_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_event_invite_summary(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Guest RSVP — no sex column; respect RSVP deadline
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
  v_deadline timestamptz;
BEGIN
  IF p_event_id IS NULL THEN RAISE EXCEPTION 'Missing event id'; END IF;
  IF length(v_clean) < 2 THEN RAISE EXCEPTION 'Please enter your name'; END IF;

  SELECT e.society_id, e.rsvp_deadline_at INTO v_host, v_deadline
  FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  IF v_deadline IS NOT NULL AND now() > v_deadline THEN
    RAISE EXCEPTION 'rsvp_closed';
  END IF;

  INSERT INTO public.event_guests (society_id, event_id, name, sex)
  VALUES (v_host, p_event_id, v_clean, NULL)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_event_rsvp_guest(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_event_rsvp_guest(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Member RSVP by email — participating societies only, normalised email, ambiguous match error
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

REVOKE ALL ON FUNCTION public.submit_public_event_rsvp_member_by_email(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_event_rsvp_member_by_email(uuid, text, text) TO anon, authenticated;
