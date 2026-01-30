-- Migration: Fix event_results RLS policies for upsert to work correctly
-- This replaces the policies from 007 with simpler, more reliable versions

-- Drop existing policies (if they exist)
DROP POLICY IF EXISTS "Society members can read event results" ON public.event_results;
DROP POLICY IF EXISTS "Captain or Handicapper can insert event results" ON public.event_results;
DROP POLICY IF EXISTS "Captain or Handicapper can update event results" ON public.event_results;
DROP POLICY IF EXISTS "Captain can delete event results" ON public.event_results;

-- Simpler SELECT policy: any authenticated user who is a member of the society can read
CREATE POLICY "event_results_select"
    ON public.event_results
    FOR SELECT
    USING (
        society_id IN (
            SELECT m.society_id FROM public.members m
            WHERE m.user_id = auth.uid()
        )
    );

-- Simpler INSERT policy: Captain or Handicapper can insert
-- Uses array containment for roles check which is more reliable
CREATE POLICY "event_results_insert"
    ON public.event_results
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = society_id
            AND m.user_id = auth.uid()
            AND (
                UPPER(m.role) IN ('CAPTAIN', 'HANDICAPPER')
                OR m.roles && ARRAY['captain', 'handicapper', 'CAPTAIN', 'HANDICAPPER']::text[]
            )
        )
    );

-- UPDATE policy with both USING and WITH CHECK (required for upsert)
CREATE POLICY "event_results_update"
    ON public.event_results
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = event_results.society_id
            AND m.user_id = auth.uid()
            AND (
                UPPER(m.role) IN ('CAPTAIN', 'HANDICAPPER')
                OR m.roles && ARRAY['captain', 'handicapper', 'CAPTAIN', 'HANDICAPPER']::text[]
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = society_id
            AND m.user_id = auth.uid()
            AND (
                UPPER(m.role) IN ('CAPTAIN', 'HANDICAPPER')
                OR m.roles && ARRAY['captain', 'handicapper', 'CAPTAIN', 'HANDICAPPER']::text[]
            )
        )
    );

-- DELETE policy: Captain only
CREATE POLICY "event_results_delete"
    ON public.event_results
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = event_results.society_id
            AND m.user_id = auth.uid()
            AND (
                UPPER(m.role) = 'CAPTAIN'
                OR m.roles && ARRAY['captain', 'CAPTAIN']::text[]
            )
        )
    );
