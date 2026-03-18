-- 059: Add emergency_contact to members; extend join_society to accept handicap_index and emergency_contact.

-- Add emergency_contact column to members
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS emergency_contact text;

COMMENT ON COLUMN public.members.emergency_contact IS 'Emergency contact details (name + phone or free text).';

-- Extend join_society to accept optional handicap_index and emergency_contact
DROP FUNCTION IF EXISTS public.join_society(text, text, text);

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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please sign in first.';
  END IF;

  p_join_code := UPPER(TRIM(COALESCE(p_join_code, '')));
  v_name := TRIM(COALESCE(p_name, ''));
  v_hi := p_handicap_index;
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

  -- Existing linked membership for this user in the target society.
  SELECT m.id
    INTO v_member_id
  FROM public.members m
  WHERE m.society_id = v_society_id
    AND m.user_id = v_user_id
  LIMIT 1;

  -- Beta frictionless access: auto-assign a seat when joining.
  IF v_member_id IS NOT NULL THEN
    UPDATE public.members m
    SET has_seat = TRUE,
        email = COALESCE(NULLIF(TRIM(p_email), ''), m.email),
        handicap_index = COALESCE(v_hi, m.handicap_index),
        emergency_contact = COALESCE(NULLIF(TRIM(p_emergency_contact), ''), m.emergency_contact)
    WHERE m.id = v_member_id;
  END IF;

  -- Claim captain-added unlinked member by name.
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

  -- Create new membership when no existing/claimable row found.
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

  -- Persist profile pointers for existing app flows.
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
  'Join a society by join code. Accepts optional handicap_index and emergency_contact. Returns the joined member row.';

-- Overload for backward compatibility: 3-param version calls 5-param with NULLs
CREATE OR REPLACE FUNCTION public.join_society(
  p_join_code text,
  p_name text,
  p_email text DEFAULT NULL
)
RETURNS SETOF public.members
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.join_society(p_join_code, p_name, p_email, NULL::numeric, NULL::text);
$$;

GRANT EXECUTE ON FUNCTION public.join_society(text, text, text) TO authenticated;
