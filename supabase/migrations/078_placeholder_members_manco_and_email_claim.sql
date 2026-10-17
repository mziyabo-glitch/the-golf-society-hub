-- 078: Pre-member / placeholder members — ManCo can add rows with user_id NULL;
--       join + claim prefer email match when ManCo recorded an email on the placeholder.

-- ---------------------------------------------------------------------------
-- 1) add_member_as_captain: allow ManCo roles (not captain-only)
-- Must DROP first: Postgres cannot change RETURNS TABLE (OUT) shape via REPLACE.
-- Keep same return columns as migration 005: id, name, role, society_id, email, created_at
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.add_member_as_captain(uuid, text, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.add_member_as_captain(
  p_society_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_role text DEFAULT 'member'
)
RETURNS TABLE (
  id uuid,
  name text,
  role text,
  society_id uuid,
  email text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_new_id uuid;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please sign in first.';
  END IF;

  IF NOT public.has_role_in_society(
    p_society_id,
    ARRAY['captain', 'secretary', 'handicapper', 'treasurer']
  ) THEN
    RAISE EXCEPTION 'Permission denied. Only ManCo (captain, secretary, handicapper, treasurer) can add members to the society.';
  END IF;

  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Member name is required.';
  END IF;

  IF p_society_id IS NULL THEN
    RAISE EXCEPTION 'Society ID is required.';
  END IF;

  INSERT INTO public.members (
    society_id,
    user_id,
    name,
    email,
    role,
    paid,
    amount_paid_pence
  ) VALUES (
    p_society_id,
    NULL,
    TRIM(p_name),
    NULLIF(TRIM(COALESCE(p_email, '')), ''),
    COALESCE(LOWER(TRIM(p_role)), 'member'),
    false,
    0
  )
  RETURNING members.id INTO v_new_id;

  RETURN QUERY
  SELECT
    m.id,
    m.name,
    m.role,
    m.society_id,
    m.email,
    m.created_at
  FROM public.members m
  WHERE m.id = v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_member_as_captain(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.add_member_as_captain(uuid, text, text, text) IS
  'ManCo adds a placeholder member (user_id NULL). Treasurer/secretary/handicapper/captain may call.';

-- ---------------------------------------------------------------------------
-- 2) join_society: claim unlinked row by email first (when email provided),
--    then by name — avoids duplicate rows and improves safe matching.
-- Drop 3-arg wrapper first (depends on 5-arg), then 5-arg body.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.join_society(text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.join_society(text, text, text, numeric, text) CASCADE;

CREATE OR REPLACE FUNCTION public.join_society(
  p_join_code text,
  p_name text,
  p_email text DEFAULT NULL,
  p_handicap_index numeric DEFAULT NULL,
  p_emergency_contact text DEFAULT NULL
)
RETURNS SETOF public.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_society_id uuid;
  v_member_id uuid;
  v_name text;
  v_hi numeric;
  v_email_norm text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please sign in first.';
  END IF;

  p_join_code := UPPER(TRIM(COALESCE(p_join_code, '')));
  v_name := TRIM(COALESCE(p_name, ''));
  v_hi := p_handicap_index;
  v_email_norm := NULLIF(LOWER(TRIM(COALESCE(p_email, ''))), '');

  IF v_hi IS NOT NULL AND (v_hi < -10 OR v_hi > 54) THEN
    RAISE EXCEPTION 'Handicap index must be between -10 and 54.';
  END IF;

  IF p_join_code = '' THEN
    RAISE EXCEPTION 'Join code is required.';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Name is required.';
  END IF;

  SELECT s.id
    INTO v_society_id
  FROM public.societies s
  WHERE s.join_code = p_join_code
  LIMIT 1;

  IF v_society_id IS NULL THEN
    RAISE EXCEPTION 'Join code not found.';
  END IF;

  SELECT m.id
    INTO v_member_id
  FROM public.members m
  WHERE m.society_id = v_society_id
    AND m.user_id = v_user_id
  LIMIT 1;

  IF v_member_id IS NOT NULL THEN
    UPDATE public.members m
    SET has_seat = TRUE,
        email = COALESCE(NULLIF(TRIM(p_email), ''), m.email),
        handicap_index = COALESCE(v_hi, m.handicap_index),
        emergency_contact = COALESCE(NULLIF(TRIM(p_emergency_contact), ''), m.emergency_contact)
    WHERE m.id = v_member_id;
  END IF;

  -- Claim placeholder by email (strongest match when ManCo stored email on the row)
  IF v_member_id IS NULL AND v_email_norm IS NOT NULL THEN
    UPDATE public.members m
    SET user_id = v_user_id,
        name = v_name,
        email = COALESCE(NULLIF(TRIM(p_email), ''), m.email),
        has_seat = TRUE,
        handicap_index = COALESCE(v_hi, m.handicap_index),
        emergency_contact = COALESCE(NULLIF(TRIM(p_emergency_contact), ''), m.emergency_contact)
    WHERE m.id = (
      SELECT m2.id
      FROM public.members m2
      WHERE m2.society_id = v_society_id
        AND m2.user_id IS NULL
        AND m2.email IS NOT NULL
        AND TRIM(m2.email) <> ''
        AND LOWER(TRIM(m2.email)) = v_email_norm
      ORDER BY m2.created_at ASC
      LIMIT 1
    )
    RETURNING m.id INTO v_member_id;
  END IF;

  -- Claim placeholder by name (same as historical behaviour)
  IF v_member_id IS NULL THEN
    UPDATE public.members m
    SET user_id = v_user_id,
        name = v_name,
        email = COALESCE(NULLIF(TRIM(p_email), ''), m.email),
        has_seat = TRUE,
        handicap_index = COALESCE(v_hi, m.handicap_index),
        emergency_contact = COALESCE(NULLIF(TRIM(p_emergency_contact), ''), m.emergency_contact)
    WHERE m.id = (
      SELECT m2.id
      FROM public.members m2
      WHERE m2.society_id = v_society_id
        AND m2.user_id IS NULL
        AND LOWER(TRIM(m2.name)) = LOWER(v_name)
      ORDER BY m2.created_at ASC
      LIMIT 1
    )
    RETURNING m.id INTO v_member_id;
  END IF;

  IF v_member_id IS NULL THEN
    INSERT INTO public.members (
      society_id,
      user_id,
      name,
      email,
      role,
      has_seat,
      paid,
      amount_paid_pence,
      handicap_index,
      emergency_contact
    )
    VALUES (
      v_society_id,
      v_user_id,
      v_name,
      NULLIF(TRIM(COALESCE(p_email, '')), ''),
      'member',
      TRUE,
      false,
      0,
      v_hi,
      NULLIF(TRIM(COALESCE(p_emergency_contact, '')), '')
    )
    RETURNING id INTO v_member_id;
  END IF;

  INSERT INTO public.profiles (id, active_society_id, active_member_id)
  VALUES (v_user_id, v_society_id, v_member_id)
  ON CONFLICT (id) DO UPDATE
    SET active_society_id = EXCLUDED.active_society_id,
        active_member_id = EXCLUDED.active_member_id;

  RETURN QUERY
  SELECT m.*
  FROM public.members m
  WHERE m.id = v_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_society(text, text, text, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.join_society(text, text, text, numeric, text) IS
  'Join by join code. Claims placeholder by email (if set on row) then by name; else inserts new member.';

-- Backward compatibility: 3-param version calls 5-param with NULLs
CREATE OR REPLACE FUNCTION public.join_society(
  p_join_code text,
  p_name text,
  p_email text DEFAULT NULL
)
RETURNS SETOF public.members
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.join_society(p_join_code, p_name, p_email, NULL::numeric, NULL::text);
$$;

GRANT EXECUTE ON FUNCTION public.join_society(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) claim_captain_added_member: optional email — email match first, then name
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_captain_added_member(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.claim_captain_added_member(uuid, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.claim_captain_added_member(
  p_society_id uuid,
  p_name text,
  p_email text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  role text,
  society_id uuid,
  user_id uuid,
  email text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_member_id uuid;
  v_email_norm text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please sign in first.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.society_id = p_society_id
      AND m.user_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'already_linked: You already have a membership in this society.';
  END IF;

  v_email_norm := NULLIF(LOWER(TRIM(COALESCE(p_email, ''))), '');

  IF v_email_norm IS NOT NULL THEN
    UPDATE public.members m
    SET user_id = v_caller_id
    WHERE m.id = (
      SELECT m2.id
      FROM public.members m2
      WHERE m2.society_id = p_society_id
        AND m2.user_id IS NULL
        AND m2.email IS NOT NULL
        AND TRIM(m2.email) <> ''
        AND LOWER(TRIM(m2.email)) = v_email_norm
      ORDER BY m2.created_at ASC
      LIMIT 1
    )
    RETURNING m.id INTO v_member_id;
  END IF;

  IF v_member_id IS NULL THEN
    UPDATE public.members m
    SET user_id = v_caller_id
    WHERE m.id = (
      SELECT m2.id
      FROM public.members m2
      WHERE m2.society_id = p_society_id
        AND m2.user_id IS NULL
        AND LOWER(TRIM(m2.name)) = LOWER(TRIM(COALESCE(p_name, '')))
      ORDER BY m2.created_at ASC
      LIMIT 1
    )
    RETURNING m.id INTO v_member_id;
  END IF;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'no_match: No matching unlinked member found.';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.name,
    m.role,
    m.society_id,
    m.user_id,
    m.email,
    m.created_at
  FROM public.members m
  WHERE m.id = v_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_captain_added_member(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.claim_captain_added_member(uuid, text, text) IS
  'Links auth user to existing placeholder row: email match first (if provided), else name match.';
