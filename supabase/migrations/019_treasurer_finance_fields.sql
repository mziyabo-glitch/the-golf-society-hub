-- Migration: 019_treasurer_finance_fields.sql
-- Purpose: Add finance/treasurer fields for membership fees and event finances
--
-- New columns:
--   societies.annual_fee_pence: Annual membership fee in pence (e.g., 5000 = £50.00)
--   members.annual_fee_paid: Whether member has paid this year's fee
--   members.annual_fee_paid_at: Date when fee was marked as paid
--   members.annual_fee_note: Optional note (e.g., "Paid by bank transfer")
--   events.income_pence: Event income in pence (green fees, prizes fund, etc.)
--   events.costs_pence: Event costs in pence (venue, prizes, etc.)
--
-- Permissions: Only Captain or Treasurer can update these fields (enforced via RLS)

-- ============================================================================
-- SOCIETIES: Annual membership fee
-- ============================================================================

DO $$
BEGIN
  -- Add annual_fee_pence column to societies
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'societies'
    AND column_name = 'annual_fee_pence'
  ) THEN
    ALTER TABLE public.societies
    ADD COLUMN annual_fee_pence integer DEFAULT NULL
      CHECK (annual_fee_pence IS NULL OR annual_fee_pence >= 0);

    COMMENT ON COLUMN public.societies.annual_fee_pence IS
      'Annual membership fee in pence (e.g., 5000 = £50.00). NULL if not set.';
  END IF;
END $$;

-- ============================================================================
-- MEMBERS: Fee payment tracking
-- ============================================================================

DO $$
BEGIN
  -- Add annual_fee_paid column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'members'
    AND column_name = 'annual_fee_paid'
  ) THEN
    ALTER TABLE public.members
    ADD COLUMN annual_fee_paid boolean NOT NULL DEFAULT false;

    COMMENT ON COLUMN public.members.annual_fee_paid IS
      'Whether member has paid their annual fee for the current period.';
  END IF;

  -- Add annual_fee_paid_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'members'
    AND column_name = 'annual_fee_paid_at'
  ) THEN
    ALTER TABLE public.members
    ADD COLUMN annual_fee_paid_at date DEFAULT NULL;

    COMMENT ON COLUMN public.members.annual_fee_paid_at IS
      'Date when the annual fee was marked as paid. NULL if not paid.';
  END IF;

  -- Add annual_fee_note column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'members'
    AND column_name = 'annual_fee_note'
  ) THEN
    ALTER TABLE public.members
    ADD COLUMN annual_fee_note text DEFAULT NULL
      CHECK (annual_fee_note IS NULL OR length(annual_fee_note) <= 500);

    COMMENT ON COLUMN public.members.annual_fee_note IS
      'Optional note about fee payment (e.g., payment method, reference).';
  END IF;
END $$;

-- ============================================================================
-- EVENTS: Income and costs tracking
-- ============================================================================

DO $$
BEGIN
  -- Add income_pence column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'events'
    AND column_name = 'income_pence'
  ) THEN
    ALTER TABLE public.events
    ADD COLUMN income_pence integer DEFAULT NULL
      CHECK (income_pence IS NULL OR income_pence >= 0);

    COMMENT ON COLUMN public.events.income_pence IS
      'Total event income in pence (green fees collected, prize fund, etc.).';
  END IF;

  -- Add costs_pence column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'events'
    AND column_name = 'costs_pence'
  ) THEN
    ALTER TABLE public.events
    ADD COLUMN costs_pence integer DEFAULT NULL
      CHECK (costs_pence IS NULL OR costs_pence >= 0);

    COMMENT ON COLUMN public.events.costs_pence IS
      'Total event costs in pence (venue hire, prizes, etc.).';
  END IF;
END $$;

-- ============================================================================
-- RLS POLICIES: Treasurer/Captain can update finance fields
-- ============================================================================

-- Policy for updating member fee status (Captain or Treasurer only)
DO $$
BEGIN
  -- Drop existing policy if it exists
  DROP POLICY IF EXISTS "captain_treasurer_update_member_fees" ON public.members;

  -- Create policy allowing Captain/Treasurer to update fee fields
  -- Note: This works alongside existing member update policies
  CREATE POLICY "captain_treasurer_update_member_fees" ON public.members
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.members AS m
        WHERE m.user_id = auth.uid()
        AND m.society_id = members.society_id
        AND m.role IN ('captain', 'treasurer')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.members AS m
        WHERE m.user_id = auth.uid()
        AND m.society_id = members.society_id
        AND m.role IN ('captain', 'treasurer')
      )
    );
END $$;

-- Policy for updating society annual fee (Captain or Treasurer only)
DO $$
BEGIN
  -- Drop existing policy if it exists
  DROP POLICY IF EXISTS "captain_treasurer_update_society_fee" ON public.societies;

  -- Create policy allowing Captain/Treasurer to update fee settings
  CREATE POLICY "captain_treasurer_update_society_fee" ON public.societies
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.members AS m
        WHERE m.user_id = auth.uid()
        AND m.society_id = societies.id
        AND m.role IN ('captain', 'treasurer')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.members AS m
        WHERE m.user_id = auth.uid()
        AND m.society_id = societies.id
        AND m.role IN ('captain', 'treasurer')
      )
    );
END $$;

-- Policy for updating event finances (Captain or Treasurer only)
DO $$
BEGIN
  -- Drop existing policy if it exists
  DROP POLICY IF EXISTS "captain_treasurer_update_event_finance" ON public.events;

  -- Create policy allowing Captain/Treasurer to update finance fields
  CREATE POLICY "captain_treasurer_update_event_finance" ON public.events
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.members AS m
        WHERE m.user_id = auth.uid()
        AND m.society_id = events.society_id
        AND m.role IN ('captain', 'treasurer')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.members AS m
        WHERE m.user_id = auth.uid()
        AND m.society_id = events.society_id
        AND m.role IN ('captain', 'treasurer')
      )
    );
END $$;

-- ============================================================================
-- INDEXES: Optimize queries on fee status
-- ============================================================================

-- Index for quickly finding unpaid members
CREATE INDEX IF NOT EXISTS idx_members_annual_fee_paid
  ON public.members (society_id, annual_fee_paid);

-- Index for event finance queries
CREATE INDEX IF NOT EXISTS idx_events_finance
  ON public.events (society_id, income_pence, costs_pence)
  WHERE income_pence IS NOT NULL OR costs_pence IS NOT NULL;
