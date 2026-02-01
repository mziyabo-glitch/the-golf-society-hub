-- Migration: 020_fix_treasurer_rls_recursion.sql
-- Purpose: Fix infinite recursion in treasurer RLS policies
--
-- Problem: The policies in 019 query the members table from within
-- members policies, causing infinite recursion (error 42P17)
--
-- Solution: Create a SECURITY DEFINER function that can check roles
-- without triggering RLS, then use that in the policies.

-- =====================================================
-- DROP PROBLEMATIC POLICIES FROM 019
-- =====================================================

DROP POLICY IF EXISTS "captain_treasurer_update_member_fees" ON public.members;
DROP POLICY IF EXISTS "captain_treasurer_update_society_fee" ON public.societies;
DROP POLICY IF EXISTS "captain_treasurer_update_event_finance" ON public.events;

-- =====================================================
-- CREATE SECURITY DEFINER FUNCTION TO CHECK ROLES
-- This function bypasses RLS to check if the current user
-- has a captain or treasurer role in a given society
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_captain_or_treasurer(p_society_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members
    WHERE society_id = p_society_id
    AND user_id = auth.uid()
    AND role IN ('captain', 'treasurer')
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_captain_or_treasurer(uuid) TO authenticated;

-- =====================================================
-- UPDATE EXISTING MEMBERS POLICIES
-- Instead of creating new policies, we modify the existing
-- members_update_own_or_captain policy to also allow treasurer
-- =====================================================

-- Drop and recreate the members update policy to include treasurer
DROP POLICY IF EXISTS members_update_own_or_captain ON public.members;

CREATE POLICY members_update_own_or_captain
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (
    -- User can update their own record
    user_id = auth.uid()
    -- OR user is captain (society creator)
    OR society_id IN (
      SELECT id FROM public.societies WHERE created_by = auth.uid()
    )
    -- OR user is captain/treasurer (checked via security definer function)
    OR public.is_captain_or_treasurer(society_id)
  );

-- =====================================================
-- UPDATE SOCIETIES POLICIES
-- Allow captain/treasurer to update society settings (including annual_fee_pence)
-- =====================================================

-- The existing societies_update_creator policy only allows the creator
-- We need to also allow treasurer to update finance fields
DROP POLICY IF EXISTS societies_update_creator ON public.societies;

CREATE POLICY societies_update_captain_treasurer
  ON public.societies
  FOR UPDATE
  TO authenticated
  USING (
    -- Original creator can update
    created_by = auth.uid()
    -- OR user is captain/treasurer of this society
    OR public.is_captain_or_treasurer(id)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.is_captain_or_treasurer(id)
  );

-- =====================================================
-- UPDATE EVENTS POLICIES
-- Allow captain/treasurer to update event finances
-- =====================================================

-- The existing events_update_society policy only allows society creator
-- We need to also allow treasurer to update finance fields
DROP POLICY IF EXISTS events_update_society ON public.events;

CREATE POLICY events_update_captain_treasurer
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    -- Society creator can update
    society_id IN (
      SELECT id FROM public.societies WHERE created_by = auth.uid()
    )
    -- OR user is captain/treasurer
    OR public.is_captain_or_treasurer(society_id)
  );

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Test that the function works (run manually in SQL editor):
-- SELECT public.is_captain_or_treasurer('your-society-id-here');
