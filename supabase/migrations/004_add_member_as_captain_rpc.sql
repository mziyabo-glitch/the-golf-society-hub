-- Migration: 004_add_member_as_captain_rpc.sql
-- Creates a SECURITY DEFINER function for Captains to add members
-- This bypasses RLS safely by validating captain role first

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS add_member_as_captain(uuid, text, text, text);

/**
 * add_member_as_captain
 *
 * Allows a Captain to add a new member to their society.
 * The new member will have user_id = NULL (unlinked account).
 *
 * Security:
 * - SECURITY DEFINER: runs with function owner privileges
 * - Validates caller is a captain of the specified society
 * - Uses direct EXISTS check (no helper functions)
 *
 * @param p_society_id - The society to add the member to
 * @param p_name - The member's display name
 * @param p_email - The member's email (optional, can be NULL)
 * @param p_role - The member's role (e.g., 'member', 'treasurer')
 * @returns The inserted member row (id, name, role, society_id)
 */
CREATE OR REPLACE FUNCTION add_member_as_captain(
  p_society_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_role text DEFAULT 'member'
)
RETURNS TABLE (
  id uuid,
  name text,
  role text,
  society_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_captain boolean;
  v_new_id uuid;
BEGIN
  -- Get the authenticated user's ID
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please sign in first.';
  END IF;

  -- Check if caller is a captain of this society (direct query, no helper functions)
  SELECT EXISTS (
    SELECT 1
    FROM members m
    WHERE m.society_id = p_society_id
      AND m.user_id = v_caller_id
      AND LOWER(m.role) = 'captain'
  ) INTO v_is_captain;

  IF NOT v_is_captain THEN
    RAISE EXCEPTION 'Permission denied. Only Captains can add members to the society.';
  END IF;

  -- Validate inputs
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Member name is required.';
  END IF;

  IF p_society_id IS NULL THEN
    RAISE EXCEPTION 'Society ID is required.';
  END IF;

  -- Insert the new member with user_id = NULL (unlinked account)
  INSERT INTO members (
    society_id,
    user_id,
    name,
    email,
    role,
    paid,
    amount_paid_pence
  ) VALUES (
    p_society_id,
    NULL,  -- user_id is NULL for captain-added members
    TRIM(p_name),
    NULLIF(TRIM(COALESCE(p_email, '')), ''),
    COALESCE(LOWER(TRIM(p_role)), 'member'),
    false,
    0
  )
  RETURNING members.id INTO v_new_id;

  -- Return the inserted member
  RETURN QUERY
  SELECT
    m.id,
    m.name,
    m.role,
    m.society_id
  FROM members m
  WHERE m.id = v_new_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION add_member_as_captain(uuid, text, text, text) TO authenticated;

-- Add a comment for documentation
COMMENT ON FUNCTION add_member_as_captain IS
  'Allows Captains to add new members to their society. Validates captain role before insert.';
