-- =====================================================
-- MIGRATION 006: Events Format/Classification + Members WHS/Handicap
-- Run this in Supabase SQL Editor
-- =====================================================
--
-- This migration adds:
-- A) Events: format (required) + classification columns with CHECK constraints
-- B) Members: whs_number + handicap_index (optional) columns
-- C) Updated RLS policies using helper functions to avoid recursion
-- =====================================================

-- =====================================================
-- PART 1: HELPER FUNCTIONS (for non-recursive RLS)
-- =====================================================

-- Ensure my_society_ids() helper exists (from previous migration)
CREATE OR REPLACE FUNCTION public.my_society_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT society_id
  FROM public.members
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.my_society_ids() TO authenticated;

-- Helper to check if user has a specific role in a society
CREATE OR REPLACE FUNCTION public.has_role_in_society(
  _society_id uuid,
  _roles text[]
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members
    WHERE society_id = _society_id
      AND user_id = auth.uid()
      AND LOWER(role) = ANY(_roles)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role_in_society(uuid, text[]) TO authenticated;

-- =====================================================
-- PART 2: EVENTS TABLE SCHEMA UPDATES
-- =====================================================

-- Add format column if not exists (will be required after migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'format'
  ) THEN
    ALTER TABLE public.events ADD COLUMN format text;
  END IF;
END $$;

-- Add classification column with default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'classification'
  ) THEN
    ALTER TABLE public.events ADD COLUMN classification text NOT NULL DEFAULT 'general';
  END IF;
END $$;

-- Set default format for existing rows without format
UPDATE public.events SET format = 'stableford' WHERE format IS NULL;

-- Now make format NOT NULL (after setting defaults)
ALTER TABLE public.events ALTER COLUMN format SET NOT NULL;
ALTER TABLE public.events ALTER COLUMN format SET DEFAULT 'stableford';

-- Add CHECK constraint for format
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_format_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_format_check
      CHECK (format IN ('medal', 'stableford', 'matchplay', 'scramble', 'texas_scramble', 'fourball', 'foursomes'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Add CHECK constraint for classification
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_classification_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_classification_check
      CHECK (classification IN ('general', 'oom', 'major', 'friendly'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Remove is_oom column if classification covers it (optional - keep for backwards compat)
-- We'll keep is_oom but set it based on classification via trigger

-- Trigger to sync is_oom with classification
CREATE OR REPLACE FUNCTION public.sync_event_is_oom()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_oom := (NEW.classification = 'oom');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_event_is_oom ON public.events;
CREATE TRIGGER trg_sync_event_is_oom
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_event_is_oom();

-- =====================================================
-- PART 3: MEMBERS TABLE SCHEMA UPDATES
-- =====================================================

-- Add whs_number column (optional - WHS/Club handicap number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'whs_number'
  ) THEN
    ALTER TABLE public.members ADD COLUMN whs_number text;
  END IF;
END $$;

-- Add handicap_index column (optional - current handicap index, e.g., 12.4)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'handicap_index'
  ) THEN
    ALTER TABLE public.members ADD COLUMN handicap_index numeric(4,1);
  END IF;
END $$;

-- Add CHECK constraint for handicap_index range (-10 to 54 per WHS rules)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_handicap_index_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_handicap_index_check
      CHECK (handicap_index IS NULL OR (handicap_index >= -10 AND handicap_index <= 54));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- =====================================================
-- PART 4: UPDATE EVENTS RLS POLICIES
-- =====================================================

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS events_select_society ON public.events;
DROP POLICY IF EXISTS events_select_in_society ON public.events;
DROP POLICY IF EXISTS events_insert_society ON public.events;
DROP POLICY IF EXISTS events_insert_member ON public.events;
DROP POLICY IF EXISTS events_insert_captain_secretary ON public.events;
DROP POLICY IF EXISTS events_update_society ON public.events;
DROP POLICY IF EXISTS events_update_member ON public.events;
DROP POLICY IF EXISTS events_update_captain_secretary ON public.events;
DROP POLICY IF EXISTS events_delete_society ON public.events;
DROP POLICY IF EXISTS events_delete_member ON public.events;
DROP POLICY IF EXISTS events_delete_captain ON public.events;

-- SELECT: All society members can view events
CREATE POLICY events_select_in_society
  ON public.events
  FOR SELECT
  TO authenticated
  USING (society_id IN (SELECT public.my_society_ids()));

-- INSERT: Only Captain or Secretary can create events
CREATE POLICY events_insert_captain_secretary
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain', 'secretary'])
  );

-- UPDATE: Only Captain or Secretary can update events
CREATE POLICY events_update_captain_secretary
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain', 'secretary'])
  );

-- DELETE: Only Captain can delete events
CREATE POLICY events_delete_captain
  ON public.events
  FOR DELETE
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain'])
  );

-- =====================================================
-- PART 5: UPDATE MEMBERS RLS POLICIES
-- =====================================================

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS members_select_society ON public.members;
DROP POLICY IF EXISTS members_select_own_or_captain ON public.members;
DROP POLICY IF EXISTS members_select_in_society ON public.members;
DROP POLICY IF EXISTS members_insert_authenticated ON public.members;
DROP POLICY IF EXISTS members_insert_self ON public.members;
DROP POLICY IF EXISTS members_update_society ON public.members;
DROP POLICY IF EXISTS members_update_own_or_captain ON public.members;
DROP POLICY IF EXISTS members_update_in_society ON public.members;
DROP POLICY IF EXISTS members_update_handicap ON public.members;
DROP POLICY IF EXISTS members_delete_society ON public.members;
DROP POLICY IF EXISTS members_delete_own_or_captain ON public.members;
DROP POLICY IF EXISTS members_delete_in_society ON public.members;

-- SELECT: All society members can see each other
CREATE POLICY members_select_in_society
  ON public.members
  FOR SELECT
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    OR user_id = auth.uid()
  );

-- INSERT: Users can insert their own membership (for join flow)
-- Captain-added members use the RPC add_member_as_captain
CREATE POLICY members_insert_self
  ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IS NULL
    OR user_id = auth.uid()
  );

-- UPDATE: Captain or Handicapper can update any member in their society
-- Regular members can update their own basic info (but not handicap - handled via RPC)
CREATE POLICY members_update_in_society
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (
    -- Must be in same society
    society_id IN (SELECT public.my_society_ids())
    AND (
      -- Own record
      user_id = auth.uid()
      -- Or is Captain/Handicapper
      OR public.has_role_in_society(society_id, ARRAY['captain', 'handicapper'])
    )
  );

-- DELETE: Only Captain can delete members
CREATE POLICY members_delete_captain
  ON public.members
  FOR DELETE
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain'])
  );

-- =====================================================
-- PART 6: RPC FOR UPDATING HANDICAP (Captain/Handicapper only)
-- =====================================================

DROP FUNCTION IF EXISTS public.update_member_handicap(uuid, text, numeric);

/**
 * update_member_handicap
 *
 * Allows Captain or Handicapper to update a member's WHS number and handicap index.
 * SECURITY DEFINER to bypass RLS and validate role.
 */
CREATE OR REPLACE FUNCTION public.update_member_handicap(
  p_member_id uuid,
  p_whs_number text DEFAULT NULL,
  p_handicap_index numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  whs_number text,
  handicap_index numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_society_id uuid;
  v_is_authorized boolean;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  -- Get the society_id for this member
  SELECT m.society_id INTO v_society_id
  FROM public.members m
  WHERE m.id = p_member_id;

  IF v_society_id IS NULL THEN
    RAISE EXCEPTION 'Member not found.';
  END IF;

  -- Check if caller is Captain or Handicapper in that society
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.society_id = v_society_id
      AND m.user_id = v_caller_id
      AND LOWER(m.role) IN ('captain', 'handicapper')
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Permission denied. Only Captain or Handicapper can update handicaps.';
  END IF;

  -- Validate handicap_index range if provided
  IF p_handicap_index IS NOT NULL AND (p_handicap_index < -10 OR p_handicap_index > 54) THEN
    RAISE EXCEPTION 'Handicap index must be between -10 and 54.';
  END IF;

  -- Update the member
  UPDATE public.members m
  SET
    whs_number = COALESCE(p_whs_number, m.whs_number),
    handicap_index = COALESCE(p_handicap_index, m.handicap_index)
  WHERE m.id = p_member_id;

  -- Return updated member
  RETURN QUERY
  SELECT m.id, m.name, m.whs_number, m.handicap_index
  FROM public.members m
  WHERE m.id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_handicap(uuid, text, numeric) TO authenticated;

COMMENT ON FUNCTION public.update_member_handicap IS
  'Allows Captain or Handicapper to update a member''s WHS number and handicap index.';

-- =====================================================
-- PART 7: VERIFICATION QUERIES
-- =====================================================

-- Check events schema
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'events'
ORDER BY ordinal_position;

-- Check events constraints
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.events'::regclass;

-- Check members schema
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'members'
ORDER BY ordinal_position;

-- Check members constraints
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.members'::regclass;

-- Check RLS policies
SELECT tablename, policyname, cmd,
       SUBSTRING(qual::text, 1, 80) as using_clause,
       SUBSTRING(with_check::text, 1, 80) as with_check_clause
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('events', 'members')
ORDER BY tablename, policyname;
