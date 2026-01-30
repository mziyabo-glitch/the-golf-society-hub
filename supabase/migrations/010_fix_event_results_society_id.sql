-- =====================================================
-- MIGRATION 010: Fix event_results table - add society_id column
-- =====================================================
--
-- ROOT CAUSE: The event_results table was created without the society_id
-- column, but the app code sends society_id in the upsert payload.
-- Error: PGRST204 "Could not find the 'society_id' column"
--
-- This migration:
-- 1. Adds society_id column (nullable first for backfill)
-- 2. Backfills existing rows from events table
-- 3. Makes society_id NOT NULL
-- 4. Adds FK constraint to societies(id)
-- 5. Adds index on society_id
-- 6. Recreates RLS policies with correct role check
--
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- STEP 1: Add society_id column if it doesn't exist
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'event_results'
        AND column_name = 'society_id'
    ) THEN
        -- Add as nullable first to allow backfill
        ALTER TABLE public.event_results ADD COLUMN society_id UUID;
        RAISE NOTICE 'Added society_id column to event_results';
    ELSE
        RAISE NOTICE 'society_id column already exists';
    END IF;
END $$;

-- =====================================================
-- STEP 2: Backfill society_id from events table
-- =====================================================
UPDATE public.event_results er
SET society_id = e.society_id
FROM public.events e
WHERE er.event_id = e.id
AND er.society_id IS NULL;

-- =====================================================
-- STEP 3: Make society_id NOT NULL (after backfill)
-- =====================================================
DO $$
BEGIN
    -- Check if there are any NULL values remaining
    IF EXISTS (SELECT 1 FROM public.event_results WHERE society_id IS NULL) THEN
        RAISE EXCEPTION 'Cannot make society_id NOT NULL - some rows have NULL values. Check for orphaned event_results.';
    END IF;

    -- Make NOT NULL if not already
    ALTER TABLE public.event_results ALTER COLUMN society_id SET NOT NULL;
    RAISE NOTICE 'Set society_id to NOT NULL';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'society_id constraint change: %', SQLERRM;
END $$;

-- =====================================================
-- STEP 4: Add FK constraint to societies(id) if not exists
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        AND table_name = 'event_results'
        AND constraint_name = 'event_results_society_id_fkey'
    ) THEN
        ALTER TABLE public.event_results
            ADD CONSTRAINT event_results_society_id_fkey
            FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added FK constraint event_results_society_id_fkey';
    ELSE
        RAISE NOTICE 'FK constraint already exists';
    END IF;
END $$;

-- =====================================================
-- STEP 5: Add index on society_id if not exists
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_event_results_society_id ON public.event_results(society_id);

-- =====================================================
-- STEP 6: Drop all existing RLS policies
-- =====================================================
DROP POLICY IF EXISTS "Society members can read event results" ON public.event_results;
DROP POLICY IF EXISTS "Captain or Handicapper can insert event results" ON public.event_results;
DROP POLICY IF EXISTS "Captain or Handicapper can update event results" ON public.event_results;
DROP POLICY IF EXISTS "Captain can delete event results" ON public.event_results;
DROP POLICY IF EXISTS "event_results_select" ON public.event_results;
DROP POLICY IF EXISTS "event_results_insert" ON public.event_results;
DROP POLICY IF EXISTS "event_results_update" ON public.event_results;
DROP POLICY IF EXISTS "event_results_delete" ON public.event_results;

-- =====================================================
-- STEP 7: Ensure RLS is enabled
-- =====================================================
ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 8: Create correct RLS policies
-- Using LOWER(m.role) which matches the members table schema
-- =====================================================

-- SELECT: Any society member can read results
CREATE POLICY "event_results_select"
    ON public.event_results
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = event_results.society_id
            AND m.user_id = auth.uid()
        )
    );

-- INSERT: Captain or Handicapper can insert
CREATE POLICY "event_results_insert"
    ON public.event_results
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = society_id
            AND m.user_id = auth.uid()
            AND LOWER(m.role) IN ('captain', 'handicapper')
        )
    );

-- UPDATE: Captain or Handicapper can update
-- Both USING and WITH CHECK required for upsert
CREATE POLICY "event_results_update"
    ON public.event_results
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = event_results.society_id
            AND m.user_id = auth.uid()
            AND LOWER(m.role) IN ('captain', 'handicapper')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = society_id
            AND m.user_id = auth.uid()
            AND LOWER(m.role) IN ('captain', 'handicapper')
        )
    );

-- DELETE: Only Captain can delete
CREATE POLICY "event_results_delete"
    ON public.event_results
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = event_results.society_id
            AND m.user_id = auth.uid()
            AND LOWER(m.role) = 'captain'
        )
    );

-- =====================================================
-- STEP 9: Create/update the updated_at trigger
-- =====================================================
CREATE OR REPLACE FUNCTION update_event_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_event_results_updated_at ON public.event_results;
CREATE TRIGGER trigger_event_results_updated_at
    BEFORE UPDATE ON public.event_results
    FOR EACH ROW
    EXECUTE FUNCTION update_event_results_updated_at();

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'event_results'
ORDER BY ordinal_position;

-- Check RLS policies
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'event_results'
ORDER BY policyname;

-- =====================================================
-- POST-MIGRATION NOTE:
-- After running this SQL, refresh the PostgREST schema cache:
-- Option 1: In Supabase Dashboard -> Settings -> API -> Click "Reload schema"
-- Option 2: Wait ~60 seconds for automatic refresh
-- Option 3: Restart the project (Settings -> General -> Restart project)
-- =====================================================
