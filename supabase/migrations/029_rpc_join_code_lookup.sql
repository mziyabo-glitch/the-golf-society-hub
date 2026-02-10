-- 029_rpc_join_code_lookup.sql
-- Replace the overly broad societies_select_joinable policy with a
-- SECURITY DEFINER RPC that performs the join-code lookup without
-- granting blanket SELECT access to every society row.

-- ============================================================================
-- 1. Create RPC: lookup_society_by_join_code
-- ============================================================================
-- Called during onboarding when a user enters a join code.
-- Returns at most one row with only the fields the join flow needs.
-- SECURITY DEFINER so it bypasses RLS (the function itself validates input).

CREATE OR REPLACE FUNCTION public.lookup_society_by_join_code(p_code TEXT)
RETURNS TABLE (
  id          UUID,
  name        TEXT,
  join_code   TEXT,
  country     TEXT,
  created_by  UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Normalise: trim + uppercase (mirrors client-side normalizeJoinCode)
  p_code := UPPER(TRIM(p_code));

  IF LENGTH(p_code) < 4 THEN
    -- Return empty set for obviously invalid codes
    RETURN;
  END IF;

  RETURN QUERY
    SELECT s.id, s.name::TEXT, s.join_code::TEXT, s.country::TEXT, s.created_by
    FROM   public.societies s
    WHERE  s.join_code = p_code
    LIMIT  1;
END;
$$;

-- Grant execute to authenticated users (needed for onboarding)
GRANT EXECUTE ON FUNCTION public.lookup_society_by_join_code(TEXT) TO authenticated;

-- ============================================================================
-- 2. Drop the broad societies_select_joinable policy
-- ============================================================================
-- This policy allowed any authenticated user to SELECT every society that has
-- a join_code. Now that the join-code lookup goes through the RPC above,
-- we no longer need this policy.

DROP POLICY IF EXISTS societies_select_joinable ON public.societies;
