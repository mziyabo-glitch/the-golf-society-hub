-- 026_member_seat_assignment.sql
-- Step 2: Allow Captain to assign/unassign purchased seats to individual members.
-- Adds has_seat boolean to members table and RPC functions for seat management.
-- seats_used on societies is kept in sync via a trigger.

-- ============================================================================
-- 1. Add has_seat column to members
-- ============================================================================

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS has_seat BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- 2. Trigger to keep societies.seats_used in sync with member has_seat count
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_society_seats_used()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_society_id UUID;
BEGIN
  -- Determine which society to recalculate for
  IF TG_OP = 'DELETE' THEN
    v_society_id := OLD.society_id;
  ELSE
    v_society_id := NEW.society_id;
  END IF;

  UPDATE societies
     SET seats_used = (
           SELECT COUNT(*)
             FROM members
            WHERE society_id = v_society_id
              AND has_seat = TRUE
         )
   WHERE id = v_society_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_sync_seats_used ON members;

CREATE TRIGGER trg_sync_seats_used
  AFTER INSERT OR UPDATE OF has_seat OR DELETE
  ON members
  FOR EACH ROW
  EXECUTE FUNCTION sync_society_seats_used();

-- ============================================================================
-- 3. RPC: assign_society_seat  (Captain only)
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_society_seat(
  p_society_id UUID,
  p_member_id  UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role  TEXT;
  v_seats_total  INT;
  v_seats_used   INT;
  v_target_society UUID;
  v_already      BOOLEAN;
BEGIN
  -- 1. Verify caller is Captain of this society
  SELECT role INTO v_caller_role
    FROM members
   WHERE society_id = p_society_id
     AND user_id    = auth.uid()
   LIMIT 1;

  IF v_caller_role IS NULL OR LOWER(v_caller_role) <> 'captain' THEN
    RAISE EXCEPTION 'Only the Captain can assign licences.';
  END IF;

  -- 2. Verify target member belongs to this society
  SELECT society_id, has_seat
    INTO v_target_society, v_already
    FROM members
   WHERE id = p_member_id;

  IF v_target_society IS NULL THEN
    RAISE EXCEPTION 'Member not found.';
  END IF;

  IF v_target_society <> p_society_id THEN
    RAISE EXCEPTION 'Member does not belong to this society.';
  END IF;

  -- 3. Idempotent: if already assigned, no-op
  IF v_already THEN
    RETURN;
  END IF;

  -- 4. Check seat availability
  SELECT seats_total, seats_used
    INTO v_seats_total, v_seats_used
    FROM societies
   WHERE id = p_society_id;

  IF v_seats_used >= v_seats_total THEN
    RAISE EXCEPTION 'No available licences. Purchase more seats first.';
  END IF;

  -- 5. Assign seat
  UPDATE members
     SET has_seat = TRUE
   WHERE id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_society_seat(UUID, UUID) TO authenticated;

-- ============================================================================
-- 4. RPC: remove_society_seat  (Captain only)
-- ============================================================================

CREATE OR REPLACE FUNCTION remove_society_seat(
  p_society_id UUID,
  p_member_id  UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role    TEXT;
  v_target_society UUID;
  v_already        BOOLEAN;
BEGIN
  -- 1. Verify caller is Captain of this society
  SELECT role INTO v_caller_role
    FROM members
   WHERE society_id = p_society_id
     AND user_id    = auth.uid()
   LIMIT 1;

  IF v_caller_role IS NULL OR LOWER(v_caller_role) <> 'captain' THEN
    RAISE EXCEPTION 'Only the Captain can remove licences.';
  END IF;

  -- 2. Verify target member belongs to this society
  SELECT society_id, has_seat
    INTO v_target_society, v_already
    FROM members
   WHERE id = p_member_id;

  IF v_target_society IS NULL THEN
    RAISE EXCEPTION 'Member not found.';
  END IF;

  IF v_target_society <> p_society_id THEN
    RAISE EXCEPTION 'Member does not belong to this society.';
  END IF;

  -- 3. Idempotent: if not assigned, no-op
  IF NOT v_already THEN
    RETURN;
  END IF;

  -- 4. Remove seat
  UPDATE members
     SET has_seat = FALSE
   WHERE id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_society_seat(UUID, UUID) TO authenticated;

-- ============================================================================
-- 5. Back-fill seats_used from any existing has_seat=TRUE rows (should be 0)
-- ============================================================================

UPDATE societies s
   SET seats_used = (
         SELECT COUNT(*)
           FROM members m
          WHERE m.society_id = s.id
            AND m.has_seat = TRUE
       );
