-- =====================================================
-- FIX MEMBERS + EVENTS - COMPLETE SOLUTION
-- Run this in Supabase SQL Editor
-- =====================================================
--
-- This script fixes:
-- A) Members: RPC add_member_as_captain + RLS for all society members to see each other
-- B) Events: Schema + RLS so create/list works for society members
--
-- Uses SECURITY DEFINER helper function to avoid RLS recursion
-- =====================================================

-- =====================================================
-- PART 1: HELPER FUNCTION (avoids RLS recursion)
-- =====================================================

-- Drop existing helper if exists
DROP FUNCTION IF EXISTS public.my_society_ids();

/**
 * my_society_ids()
 *
 * SECURITY DEFINER function that returns the society IDs
 * the current user belongs to. This avoids infinite recursion
 * when used in RLS policies on the members table.
 */
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.my_society_ids() TO authenticated;

COMMENT ON FUNCTION public.my_society_ids IS
  'Returns society IDs the current user belongs to. SECURITY DEFINER to avoid RLS recursion.';

-- =====================================================
-- PART 2: FIX MEMBERS TABLE SCHEMA
-- =====================================================

-- Allow user_id to be NULL (for captain-added "offline" members)
ALTER TABLE public.members ALTER COLUMN user_id DROP NOT NULL;

-- Ensure all expected columns exist
DO $$
BEGIN
  -- Add display_name if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'members'
    AND column_name = 'display_name'
  ) THEN
    ALTER TABLE public.members ADD COLUMN display_name text;
  END IF;
END $$;

-- =====================================================
-- PART 3: FIX MEMBERS RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing members policies
DROP POLICY IF EXISTS members_select_society ON public.members;
DROP POLICY IF EXISTS members_select_own_or_captain ON public.members;
DROP POLICY IF EXISTS members_select_in_society ON public.members;
DROP POLICY IF EXISTS members_insert_authenticated ON public.members;
DROP POLICY IF EXISTS members_insert_self ON public.members;
DROP POLICY IF EXISTS members_update_society ON public.members;
DROP POLICY IF EXISTS members_update_own_or_captain ON public.members;
DROP POLICY IF EXISTS members_delete_society ON public.members;
DROP POLICY IF EXISTS members_delete_own_or_captain ON public.members;

-- SELECT: Users can see all members in societies they belong to
-- Uses helper function to avoid recursion
CREATE POLICY members_select_in_society
  ON public.members
  FOR SELECT
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    OR user_id = auth.uid()
  );

-- INSERT: Users can only insert their own membership (for join flow)
-- user_id must be NULL (captain-added) or match auth.uid()
CREATE POLICY members_insert_self
  ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IS NULL
    OR user_id = auth.uid()
  );

-- UPDATE: Society members can update (for captains managing members)
-- Uses helper function to avoid recursion
CREATE POLICY members_update_in_society
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    OR user_id = auth.uid()
  );

-- DELETE: Society members can delete (for captains managing members)
CREATE POLICY members_delete_in_society
  ON public.members
  FOR DELETE
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    OR user_id = auth.uid()
  );

-- =====================================================
-- PART 4: CREATE/REPLACE add_member_as_captain RPC
-- =====================================================

DROP FUNCTION IF EXISTS public.add_member_as_captain(uuid, text, text, text);

/**
 * add_member_as_captain
 *
 * Allows a Captain to add a new member to their society.
 * The new member will have user_id = NULL (unlinked account).
 *
 * Security:
 * - SECURITY DEFINER: runs with function owner privileges (bypasses RLS)
 * - Validates caller is a captain of the specified society
 * - Uses direct EXISTS check (no recursive helper functions)
 */
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
  v_is_captain boolean;
  v_new_id uuid;
BEGIN
  -- Get the authenticated user's ID
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please sign in first.';
  END IF;

  -- Check if caller is a captain of this society (direct query, bypasses RLS)
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
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
  INSERT INTO public.members (
    society_id,
    user_id,
    name,
    email,
    role,
    paid,
    amount_paid_pence,
    created_at
  ) VALUES (
    p_society_id,
    NULL,
    TRIM(p_name),
    NULLIF(TRIM(COALESCE(p_email, '')), ''),
    COALESCE(LOWER(TRIM(p_role)), 'member'),
    false,
    0,
    now()
  )
  RETURNING members.id INTO v_new_id;

  -- Return the inserted member
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.add_member_as_captain(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.add_member_as_captain IS
  'Allows Captains to add new members to their society. Validates captain role before insert.';

-- =====================================================
-- PART 5: FIX EVENTS TABLE SCHEMA
-- =====================================================

-- Create events table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  name text NOT NULL,
  date date,
  course_id uuid,
  course_name text,
  format text,
  status text DEFAULT 'upcoming',
  is_oom boolean NOT NULL DEFAULT false,
  is_completed boolean NOT NULL DEFAULT false,
  winner_name text,
  player_ids uuid[] DEFAULT '{}',
  results jsonb DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add missing columns if table already exists
DO $$
BEGIN
  -- course_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'course_id'
  ) THEN
    ALTER TABLE public.events ADD COLUMN course_id uuid;
  END IF;

  -- course_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'course_name'
  ) THEN
    ALTER TABLE public.events ADD COLUMN course_name text;
  END IF;

  -- format
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'format'
  ) THEN
    ALTER TABLE public.events ADD COLUMN format text;
  END IF;

  -- status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.events ADD COLUMN status text DEFAULT 'upcoming';
  END IF;

  -- is_oom
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'is_oom'
  ) THEN
    ALTER TABLE public.events ADD COLUMN is_oom boolean NOT NULL DEFAULT false;
  END IF;

  -- is_completed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'is_completed'
  ) THEN
    ALTER TABLE public.events ADD COLUMN is_completed boolean NOT NULL DEFAULT false;
  END IF;

  -- winner_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'winner_name'
  ) THEN
    ALTER TABLE public.events ADD COLUMN winner_name text;
  END IF;

  -- player_ids
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'player_ids'
  ) THEN
    ALTER TABLE public.events ADD COLUMN player_ids uuid[] DEFAULT '{}';
  END IF;

  -- results
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'results'
  ) THEN
    ALTER TABLE public.events ADD COLUMN results jsonb DEFAULT '{}';
  END IF;

  -- created_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.events ADD COLUMN created_by uuid;
  END IF;

  -- updated_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.events ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- =====================================================
-- PART 6: TRIGGER TO SET created_by IF NOT PROVIDED
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_created_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_created_by ON public.events;
CREATE TRIGGER trg_events_created_by
  BEFORE INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_created_by();

-- =====================================================
-- PART 7: FIX EVENTS RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS events_select_society ON public.events;
DROP POLICY IF EXISTS events_select_in_society ON public.events;
DROP POLICY IF EXISTS events_insert_society ON public.events;
DROP POLICY IF EXISTS events_insert_member ON public.events;
DROP POLICY IF EXISTS events_update_society ON public.events;
DROP POLICY IF EXISTS events_update_member ON public.events;
DROP POLICY IF EXISTS events_delete_society ON public.events;
DROP POLICY IF EXISTS events_delete_member ON public.events;

-- SELECT: Users can see events in societies they belong to
-- Uses helper function to avoid recursion
CREATE POLICY events_select_in_society
  ON public.events
  FOR SELECT
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
  );

-- INSERT: Society members can create events
-- Uses helper function to avoid recursion
CREATE POLICY events_insert_member
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    society_id IN (SELECT public.my_society_ids())
  );

-- UPDATE: Society members can update events
CREATE POLICY events_update_member
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
  );

-- DELETE: Society members can delete events
CREATE POLICY events_delete_member
  ON public.events
  FOR DELETE
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
  );

-- =====================================================
-- PART 8: VERIFICATION QUERIES
-- =====================================================

-- Check members table schema
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'members'
ORDER BY ordinal_position;

-- Check events table schema
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'events'
ORDER BY ordinal_position;

-- Check RLS policies
SELECT
  tablename,
  policyname,
  permissive,
  roles::text,
  cmd,
  SUBSTRING(qual::text, 1, 100) as using_clause,
  SUBSTRING(with_check::text, 1, 100) as with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('members', 'events')
ORDER BY tablename, policyname;

-- Check functions exist
SELECT
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('my_society_ids', 'add_member_as_captain', 'set_created_by');
