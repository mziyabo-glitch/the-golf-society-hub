-- =====================================================
-- FIX RLS POLICIES - NO RECURSION
-- Run this in Supabase SQL Editor
-- =====================================================
--
-- Problem: Previous members policies caused "infinite recursion detected"
-- because they queried the members table from within members policies.
--
-- Solution:
-- - Members INSERT: Only allow user_id = auth.uid() (add yourself only)
-- - Members SELECT/UPDATE/DELETE: Check societies.created_by instead of
--   querying members to avoid recursion
--
-- =====================================================

-- =====================================================
-- STEP 1: ENABLE RLS ON ALL TABLES
-- =====================================================

ALTER TABLE public.societies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 2: DROP EXISTING POLICIES (only the ones we recreate)
-- =====================================================

-- Societies policies
DROP POLICY IF EXISTS societies_select_all ON public.societies;
DROP POLICY IF EXISTS societies_select_authenticated ON public.societies;
DROP POLICY IF EXISTS societies_insert_creator ON public.societies;
DROP POLICY IF EXISTS societies_update_creator ON public.societies;
DROP POLICY IF EXISTS societies_delete_creator ON public.societies;

-- Members policies (the problematic ones with recursion)
DROP POLICY IF EXISTS members_select_society ON public.members;
DROP POLICY IF EXISTS members_select_own_or_captain ON public.members;
DROP POLICY IF EXISTS members_insert_authenticated ON public.members;
DROP POLICY IF EXISTS members_insert_self ON public.members;
DROP POLICY IF EXISTS members_update_society ON public.members;
DROP POLICY IF EXISTS members_update_own_or_captain ON public.members;
DROP POLICY IF EXISTS members_delete_society ON public.members;
DROP POLICY IF EXISTS members_delete_own_or_captain ON public.members;

-- Profiles policies
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

-- Events policies
DROP POLICY IF EXISTS events_select_society ON public.events;
DROP POLICY IF EXISTS events_insert_society ON public.events;
DROP POLICY IF EXISTS events_update_society ON public.events;
DROP POLICY IF EXISTS events_delete_society ON public.events;

-- =====================================================
-- STEP 3: SOCIETIES TABLE POLICIES
-- =====================================================

-- SELECT: Authenticated users can read societies with a join_code
-- This enables join-by-code lookup without exposing private data
CREATE POLICY societies_select_authenticated
  ON public.societies
  FOR SELECT
  TO authenticated
  USING (join_code IS NOT NULL);

-- INSERT: Only creator can insert (created_by must match auth.uid())
CREATE POLICY societies_insert_creator
  ON public.societies
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- UPDATE: Only creator can update their society
CREATE POLICY societies_update_creator
  ON public.societies
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- DELETE: Only creator can delete their society
CREATE POLICY societies_delete_creator
  ON public.societies
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- =====================================================
-- STEP 4: MEMBERS TABLE POLICIES (NO RECURSION!)
-- =====================================================
-- IMPORTANT: These policies do NOT query the members table.
-- Instead, they check societies.created_by to determine captain status.

-- INSERT: Authenticated users can only insert their own member record
-- (user_id must be null or match auth.uid())
CREATE POLICY members_insert_self
  ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IS NULL
    OR user_id = auth.uid()
  );

-- SELECT: User can see:
--   a) Their own membership (user_id = auth.uid())
--   b) All members of societies they created (captain/creator visibility)
-- NO recursion: we query societies, not members
CREATE POLICY members_select_own_or_captain
  ON public.members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR society_id IN (
      SELECT id FROM public.societies WHERE created_by = auth.uid()
    )
  );

-- UPDATE: User can update:
--   a) Their own membership (user_id = auth.uid())
--   b) Any member in societies they created (captain privilege)
CREATE POLICY members_update_own_or_captain
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR society_id IN (
      SELECT id FROM public.societies WHERE created_by = auth.uid()
    )
  );

-- DELETE: User can delete:
--   a) Their own membership (user_id = auth.uid())
--   b) Any member in societies they created (captain privilege)
CREATE POLICY members_delete_own_or_captain
  ON public.members
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR society_id IN (
      SELECT id FROM public.societies WHERE created_by = auth.uid()
    )
  );

-- =====================================================
-- STEP 5: PROFILES TABLE POLICIES
-- =====================================================

-- Users can only read their own profile
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Users can only insert their own profile
CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Users can only update their own profile
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- =====================================================
-- STEP 6: EVENTS TABLE POLICIES
-- =====================================================
-- Events are scoped to societies the user is captain of
-- (simple, non-recursive approach)

-- SELECT: Users can see events for societies they created
-- OR events linked to societies where they have a member record
-- Using a subquery on societies (not members) to avoid recursion
CREATE POLICY events_select_society
  ON public.events
  FOR SELECT
  TO authenticated
  USING (
    society_id IN (
      SELECT id FROM public.societies WHERE created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.members
      WHERE members.society_id = events.society_id
      AND members.user_id = auth.uid()
    )
  );

-- INSERT: Only captains (society creators) can create events
CREATE POLICY events_insert_society
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    society_id IN (
      SELECT id FROM public.societies WHERE created_by = auth.uid()
    )
  );

-- UPDATE: Only captains can update events
CREATE POLICY events_update_society
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    society_id IN (
      SELECT id FROM public.societies WHERE created_by = auth.uid()
    )
  );

-- DELETE: Only captains can delete events
CREATE POLICY events_delete_society
  ON public.events
  FOR DELETE
  TO authenticated
  USING (
    society_id IN (
      SELECT id FROM public.societies WHERE created_by = auth.uid()
    )
  );

-- =====================================================
-- VERIFICATION: Run this to check policies are set up
-- =====================================================

SELECT
  tablename,
  policyname,
  permissive,
  roles::text,
  cmd,
  SUBSTRING(qual::text, 1, 80) as using_clause,
  SUBSTRING(with_check::text, 1, 80) as with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
