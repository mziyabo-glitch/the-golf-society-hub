-- 036_join_society_rpc_requires_name.sql
-- Ensure join_society requires p_name and always inserts members.name.

-- Drop older signatures to avoid parameter-name mismatches from clients.
DROP FUNCTION IF EXISTS public.join_society(text);
DROP FUNCTION IF EXISTS public.join_society(text, text);
DROP FUNCTION IF EXISTS public.join_society(text, text, text);

CREATE OR REPLACE FUNCTION public.join_society(
  p_join_code text,
  p_name text,
  p_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_society_id uuid;
  v_member_id uuid;
  v_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please sign in first.';
  END IF;

  p_join_code := UPPER(TRIM(COALESCE(p_join_code, '')));
  v_name := TRIM(COALESCE(p_name, ''));

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

  -- If user already has a linked member in this society, reuse it.
  SELECT m.id
    INTO v_member_id
  FROM public.members m
  WHERE m.society_id = v_society_id
    AND m.user_id = v_user_id
  LIMIT 1;

  -- Otherwise, try to claim an unlinked captain-added row by name.
  IF v_member_id IS NULL THEN
    UPDATE public.members m
    SET user_id = v_user_id,
        name = v_name,
        email = COALESCE(NULLIF(TRIM(p_email), ''), m.email)
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

  -- If nothing to claim, create a new member with NOT NULL name.
  IF v_member_id IS NULL THEN
    INSERT INTO public.members (
      society_id,
      user_id,
      name,
      email,
      role,
      paid,
      amount_paid_pence
    )
    VALUES (
      v_society_id,
      v_user_id,
      v_name,
      NULLIF(TRIM(COALESCE(p_email, '')), ''),
      'member',
      false,
      0
    )
    RETURNING id INTO v_member_id;
  END IF;

  -- Persist active pointers for post-join routing.
  INSERT INTO public.profiles (id, active_society_id, active_member_id)
  VALUES (v_user_id, v_society_id, v_member_id)
  ON CONFLICT (id) DO UPDATE
    SET active_society_id = EXCLUDED.active_society_id,
        active_member_id = EXCLUDED.active_member_id;

  RETURN v_society_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_society(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.join_society(text, text, text) IS
  'Join a society by join code. Requires p_name, creates/claims member, sets active profile pointers, returns society_id.';
