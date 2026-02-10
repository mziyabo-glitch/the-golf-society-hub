-- 025_society_seats.sql
-- Add licence seat columns to societies table for Captain seat purchasing (Step 1)

-- Add seat tracking columns
ALTER TABLE societies
  ADD COLUMN IF NOT EXISTS seats_total     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seats_used      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS licence_expires_at TIMESTAMPTZ NULL;

-- Secure RPC: increment seats_total (Captain only)
CREATE OR REPLACE FUNCTION increment_society_seats(
  p_society_id UUID,
  p_delta      INT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- Validate delta
  IF p_delta < 1 OR p_delta > 100 THEN
    RAISE EXCEPTION 'Delta must be between 1 and 100';
  END IF;

  -- Check caller is Captain of this society
  SELECT role INTO v_caller_role
    FROM members
   WHERE society_id = p_society_id
     AND user_id    = auth.uid()
   LIMIT 1;

  IF v_caller_role IS NULL OR LOWER(v_caller_role) <> 'captain' THEN
    RAISE EXCEPTION 'Only the Captain can purchase licences.';
  END IF;

  -- Increment seats_total
  UPDATE societies
     SET seats_total = seats_total + p_delta
   WHERE id = p_society_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Society not found.';
  END IF;
END;
$$;

-- Grant execute to authenticated users (RLS on the function body handles role check)
GRANT EXECUTE ON FUNCTION increment_society_seats(UUID, INT) TO authenticated;

-- Allow society members to read seat columns (already covered by existing SELECT RLS,
-- but ensure the columns are accessible through the existing policies).
-- No new RLS policies needed since societies already has a SELECT policy for members.
