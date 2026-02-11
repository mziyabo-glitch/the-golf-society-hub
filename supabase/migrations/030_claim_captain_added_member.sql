-- =====================================================
-- Migration 030: claim_captain_added_member RPC
-- =====================================================
-- When a Captain adds a member (e.g. "Waniwa Moyo"), the member row
-- is created with user_id = NULL. When that person later joins via
-- join code, we need to link them to the existing row instead of
-- creating a duplicate.
--
-- This SECURITY DEFINER RPC finds an unlinked member by name
-- (case-insensitive) in a society and sets user_id = auth.uid().
-- =====================================================

DROP FUNCTION IF EXISTS public.claim_captain_added_member(uuid, text);

CREATE OR REPLACE FUNCTION public.claim_captain_added_member(
  p_society_id uuid,
  p_name text
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
BEGIN
  -- Authenticate
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please sign in first.';
  END IF;

  -- Guard: caller must not already have a linked member in this society
  IF EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.society_id = p_society_id
      AND m.user_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'already_linked: You already have a membership in this society.';
  END IF;

  -- Find the first unlinked member with a matching name (case-insensitive, trimmed)
  -- and claim it by setting user_id = auth.uid()
  UPDATE public.members m
  SET user_id = v_caller_id
  WHERE m.id = (
    SELECT m2.id
    FROM public.members m2
    WHERE m2.society_id = p_society_id
      AND m2.user_id IS NULL
      AND LOWER(TRIM(m2.name)) = LOWER(TRIM(p_name))
    ORDER BY m2.created_at ASC
    LIMIT 1
  )
  RETURNING m.id INTO v_member_id;

  -- If no match found, raise a catchable exception
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'no_match: No matching unlinked member found.';
  END IF;

  -- Return the claimed member row
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.claim_captain_added_member(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.claim_captain_added_member IS
  'Claims a captain-added member (user_id IS NULL) by matching name. Sets user_id = auth.uid(). Prevents duplicate members when joining via code.';
