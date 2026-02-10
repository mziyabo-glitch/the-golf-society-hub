-- 027_licence_requests.sql
-- Step 3: Licence request flow — members can request access, Captains can approve/reject.

-- ============================================================================
-- 1. Create licence_requests table
-- ============================================================================

CREATE TABLE IF NOT EXISTS licence_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id        UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  requester_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  requester_user_id UUID NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ NULL,
  resolved_by       UUID NULL,
  requester_name    TEXT NULL
);

-- Unique constraint: one pending request per requester per society
CREATE UNIQUE INDEX IF NOT EXISTS uq_licence_requests_pending
  ON licence_requests (society_id, requester_user_id)
  WHERE status = 'pending';

-- Index for Captain lookups
CREATE INDEX IF NOT EXISTS idx_licence_requests_society_status
  ON licence_requests (society_id, status);

-- ============================================================================
-- 2. RLS policies
-- ============================================================================

ALTER TABLE licence_requests ENABLE ROW LEVEL SECURITY;

-- Requester can read their own requests
CREATE POLICY licence_requests_select_own ON licence_requests
  FOR SELECT
  USING (requester_user_id = auth.uid());

-- Captain can read all requests for their society
CREATE POLICY licence_requests_select_captain ON licence_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM members
       WHERE members.society_id = licence_requests.society_id
         AND members.user_id = auth.uid()
         AND LOWER(members.role) = 'captain'
    )
  );

-- Writes go through RPCs only (SECURITY DEFINER), so no INSERT/UPDATE policies needed.
-- But we grant INSERT for the RPC to work from authenticated context:
CREATE POLICY licence_requests_insert_own ON licence_requests
  FOR INSERT
  WITH CHECK (requester_user_id = auth.uid());

-- ============================================================================
-- 3. RPC: create_licence_request (member self-service)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_licence_request(
  p_society_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id       UUID;
  v_member_id     UUID;
  v_member_name   TEXT;
  v_has_seat      BOOLEAN;
  v_existing_id   UUID;
  v_new_id        UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  -- Look up the member row for this user in this society
  SELECT id, name, has_seat
    INTO v_member_id, v_member_name, v_has_seat
    FROM members
   WHERE society_id = p_society_id
     AND user_id    = v_user_id
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this society.';
  END IF;

  -- If already has seat, no need to request
  IF v_has_seat THEN
    RAISE EXCEPTION 'You already have a licence assigned.';
  END IF;

  -- Check for existing pending request (idempotent)
  SELECT id INTO v_existing_id
    FROM licence_requests
   WHERE society_id        = p_society_id
     AND requester_user_id = v_user_id
     AND status            = 'pending';

  IF v_existing_id IS NOT NULL THEN
    -- Already pending — return existing id without error
    RETURN v_existing_id;
  END IF;

  -- Insert new request
  INSERT INTO licence_requests (society_id, requester_member_id, requester_user_id, requester_name)
  VALUES (p_society_id, v_member_id, v_user_id, v_member_name)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_licence_request(UUID) TO authenticated;

-- ============================================================================
-- 4. RPC: resolve_licence_request (Captain only)
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_licence_request(
  p_request_id UUID,
  p_action     TEXT  -- 'approve' or 'reject'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_uid     UUID;
  v_caller_role    TEXT;
  v_society_id     UUID;
  v_member_id      UUID;
  v_status         TEXT;
  v_seats_total    INT;
  v_seats_used     INT;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action. Use "approve" or "reject".';
  END IF;

  -- Fetch the request
  SELECT society_id, requester_member_id, status
    INTO v_society_id, v_member_id, v_status
    FROM licence_requests
   WHERE id = p_request_id;

  IF v_society_id IS NULL THEN
    RAISE EXCEPTION 'Request not found.';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Request has already been resolved.';
  END IF;

  -- Verify caller is Captain of this society
  SELECT role INTO v_caller_role
    FROM members
   WHERE society_id = v_society_id
     AND user_id    = v_caller_uid
   LIMIT 1;

  IF v_caller_role IS NULL OR LOWER(v_caller_role) <> 'captain' THEN
    RAISE EXCEPTION 'Only the Captain can resolve licence requests.';
  END IF;

  IF p_action = 'approve' THEN
    -- Check seat availability
    SELECT seats_total, seats_used
      INTO v_seats_total, v_seats_used
      FROM societies
     WHERE id = v_society_id;

    IF v_seats_used >= v_seats_total THEN
      RAISE EXCEPTION 'No available licences. Purchase more seats first.';
    END IF;

    -- Assign seat to the member (idempotent — trigger keeps seats_used in sync)
    UPDATE members
       SET has_seat = TRUE
     WHERE id = v_member_id;
  END IF;

  -- Mark request resolved
  UPDATE licence_requests
     SET status      = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
         resolved_at = now(),
         resolved_by = v_caller_uid
   WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_licence_request(UUID, TEXT) TO authenticated;
