-- =====================================================
-- MIGRATION 009: Fix event_results RLS policies
-- =====================================================
--
-- ROOT CAUSE: Migrations 007/008 referenced m.roles (array column) which
-- doesn't exist. The members table only has `role` (singular text column).
--
-- This migration fixes the RLS policies to use:
-- 1. has_role_in_society() helper (preferred - uses LOWER(role))
-- 2. Falls back to direct LOWER(m.role) check
--
-- Run this in Supabase SQL Editor
-- =====================================================

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS "Society members can read event results" ON public.event_results;
DROP POLICY IF EXISTS "Captain or Handicapper can insert event results" ON public.event_results;
DROP POLICY IF EXISTS "Captain or Handicapper can update event results" ON public.event_results;
DROP POLICY IF EXISTS "Captain can delete event results" ON public.event_results;
DROP POLICY IF EXISTS "event_results_select" ON public.event_results;
DROP POLICY IF EXISTS "event_results_insert" ON public.event_results;
DROP POLICY IF EXISTS "event_results_update" ON public.event_results;
DROP POLICY IF EXISTS "event_results_delete" ON public.event_results;

-- =====================================================
-- RECREATE POLICIES USING has_role_in_society() HELPER
-- =====================================================

-- SELECT: Any member of the society can read results
CREATE POLICY "event_results_select"
    ON public.event_results
    FOR SELECT
    TO authenticated
    USING (
        society_id IN (SELECT public.my_society_ids())
    );

-- INSERT: Captain or Handicapper can insert results
CREATE POLICY "event_results_insert"
    ON public.event_results
    FOR INSERT
    TO authenticated
    WITH CHECK (
        society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(society_id, ARRAY['captain', 'handicapper'])
    );

-- UPDATE: Captain or Handicapper can update results
-- Both USING and WITH CHECK are required for upsert operations
CREATE POLICY "event_results_update"
    ON public.event_results
    FOR UPDATE
    TO authenticated
    USING (
        society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(society_id, ARRAY['captain', 'handicapper'])
    )
    WITH CHECK (
        society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(society_id, ARRAY['captain', 'handicapper'])
    );

-- DELETE: Only Captain can delete results
CREATE POLICY "event_results_delete"
    ON public.event_results
    FOR DELETE
    TO authenticated
    USING (
        society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(society_id, ARRAY['captain'])
    );

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Run this to check policies were created correctly:
SELECT policyname, cmd,
       SUBSTRING(qual::text, 1, 100) as using_clause,
       SUBSTRING(with_check::text, 1, 100) as with_check_clause
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'event_results'
ORDER BY policyname;
