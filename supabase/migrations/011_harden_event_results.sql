-- =====================================================
-- MIGRATION 011: Harden event_results table (COMPLETE FIX)
-- =====================================================
--
-- This migration ensures the event_results table is correctly set up
-- with all required columns, constraints, indexes, and RLS policies.
--
-- ROOT CAUSE: Table was missing society_id column causing PGRST204
-- RLS policies referenced non-existent m.roles column
--
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- STEP 1: Create table if not exists (full schema)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.event_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    member_id UUID NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- STEP 2: Add society_id column if missing
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'event_results'
        AND column_name = 'society_id'
    ) THEN
        ALTER TABLE public.event_results ADD COLUMN society_id UUID;
        RAISE NOTICE 'Added society_id column to event_results';
    ELSE
        RAISE NOTICE 'society_id column already exists';
    END IF;
END $$;

-- =====================================================
-- STEP 3: Backfill society_id from events table
-- =====================================================
UPDATE public.event_results er
SET society_id = e.society_id
FROM public.events e
WHERE er.event_id = e.id
AND er.society_id IS NULL;

-- Delete orphaned rows (no matching event)
DELETE FROM public.event_results
WHERE society_id IS NULL
AND event_id NOT IN (SELECT id FROM public.events);

-- =====================================================
-- STEP 4: Make society_id NOT NULL (after backfill)
-- =====================================================
DO $$
BEGIN
    -- Check for remaining NULLs (should be none after backfill)
    IF EXISTS (SELECT 1 FROM public.event_results WHERE society_id IS NULL) THEN
        RAISE NOTICE 'Warning: Some rows still have NULL society_id - these will be deleted';
        DELETE FROM public.event_results WHERE society_id IS NULL;
    END IF;

    -- Make NOT NULL
    BEGIN
        ALTER TABLE public.event_results ALTER COLUMN society_id SET NOT NULL;
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'society_id constraint change: %', SQLERRM;
    END;
END $$;

-- =====================================================
-- STEP 5: Add/ensure unique constraint (event_id, member_id)
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.event_results'::regclass
        AND conname = 'event_results_event_id_member_id_key'
    ) THEN
        ALTER TABLE public.event_results
            ADD CONSTRAINT event_results_event_id_member_id_key UNIQUE (event_id, member_id);
        RAISE NOTICE 'Added unique constraint (event_id, member_id)';
    ELSE
        RAISE NOTICE 'Unique constraint already exists';
    END IF;
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Unique constraint already exists (caught exception)';
END $$;

-- =====================================================
-- STEP 6: Add foreign key constraints
-- =====================================================
DO $$
BEGIN
    -- FK to events
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        AND table_name = 'event_results'
        AND constraint_name = 'event_results_event_id_fkey'
    ) THEN
        ALTER TABLE public.event_results
            ADD CONSTRAINT event_results_event_id_fkey
            FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added FK to events';
    END IF;

    -- FK to members
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        AND table_name = 'event_results'
        AND constraint_name = 'event_results_member_id_fkey'
    ) THEN
        ALTER TABLE public.event_results
            ADD CONSTRAINT event_results_member_id_fkey
            FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added FK to members';
    END IF;

    -- FK to societies
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        AND table_name = 'event_results'
        AND constraint_name = 'event_results_society_id_fkey'
    ) THEN
        ALTER TABLE public.event_results
            ADD CONSTRAINT event_results_society_id_fkey
            FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added FK to societies';
    END IF;
END $$;

-- =====================================================
-- STEP 7: Create indexes for performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_event_results_society_id ON public.event_results(society_id);
CREATE INDEX IF NOT EXISTS idx_event_results_event_id ON public.event_results(event_id);
CREATE INDEX IF NOT EXISTS idx_event_results_member_id ON public.event_results(member_id);
-- Composite index for leaderboard query
CREATE INDEX IF NOT EXISTS idx_event_results_society_member ON public.event_results(society_id, member_id);

-- =====================================================
-- STEP 8: Drop ALL existing RLS policies (clean slate)
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
-- STEP 9: Enable RLS
-- =====================================================
ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 10: Create correct RLS policies
-- Uses LOWER(m.role) which matches actual members table schema
-- No reference to non-existent m.roles array column
-- =====================================================

-- SELECT: Any member of the society can read results
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

-- INSERT: Captain, Handicapper, or Secretary can insert
CREATE POLICY "event_results_insert"
    ON public.event_results
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = society_id
            AND m.user_id = auth.uid()
            AND LOWER(m.role) IN ('captain', 'handicapper', 'secretary')
        )
    );

-- UPDATE: Captain, Handicapper, or Secretary can update
-- Both USING and WITH CHECK are required for upsert to work
CREATE POLICY "event_results_update"
    ON public.event_results
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = event_results.society_id
            AND m.user_id = auth.uid()
            AND LOWER(m.role) IN ('captain', 'handicapper', 'secretary')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = society_id
            AND m.user_id = auth.uid()
            AND LOWER(m.role) IN ('captain', 'handicapper', 'secretary')
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
-- STEP 11: Create/update the updated_at trigger
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

-- Check table columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'event_results'
ORDER BY ordinal_position;

-- Check constraints
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.event_results'::regclass;

-- Check RLS policies
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'event_results'
ORDER BY policyname;

-- Check indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'event_results';

-- =====================================================
-- POST-MIGRATION: REFRESH POSTGREST SCHEMA CACHE
-- =====================================================
-- After running this migration, you MUST refresh the schema cache:
--
-- Option 1 (Recommended): Supabase Dashboard
--   Settings → API → Click "Reload schema"
--
-- Option 2: Wait ~60 seconds for automatic refresh
--
-- Option 3: Restart project
--   Settings → General → Restart project
--
-- VERIFY the fix by checking API response:
--   The PGRST204 error should no longer occur.
-- =====================================================
