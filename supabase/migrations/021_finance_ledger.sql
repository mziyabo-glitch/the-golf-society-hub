-- Migration: Finance Ledger
-- Description: Adds finance_entries table for society ledger and opening_balance_pence to societies
-- Date: 2026-02-02

-- =====================================================
-- 1. ADD OPENING BALANCE TO SOCIETIES
-- =====================================================

-- Add opening_balance_pence column to societies (nullable, defaults to 0)
ALTER TABLE public.societies
ADD COLUMN IF NOT EXISTS opening_balance_pence INTEGER DEFAULT 0;

COMMENT ON COLUMN public.societies.opening_balance_pence IS 'Opening balance for the society ledger in pence';

-- =====================================================
-- 2. CREATE FINANCE_ENTRIES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id UUID NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'cost')),
  entry_date DATE NOT NULL,
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  description TEXT NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_finance_entries_society_id ON public.finance_entries(society_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_entry_date ON public.finance_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_type ON public.finance_entries(type);

-- Add table comment
COMMENT ON TABLE public.finance_entries IS 'Society financial ledger entries (income and cost items)';

-- =====================================================
-- 3. CREATE TRIGGER FOR UPDATED_AT
-- =====================================================

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for finance_entries
DROP TRIGGER IF EXISTS set_finance_entries_updated_at ON public.finance_entries;
CREATE TRIGGER set_finance_entries_updated_at
  BEFORE UPDATE ON public.finance_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- 4. ENABLE RLS
-- =====================================================

ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. CREATE RLS POLICIES
-- =====================================================

-- Use the existing is_captain_or_treasurer function from migration 020
-- If it doesn't exist, create it
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

-- Read policy: Captain or Treasurer can read finance entries
DROP POLICY IF EXISTS finance_entries_read ON public.finance_entries;
CREATE POLICY finance_entries_read ON public.finance_entries
  FOR SELECT
  USING (is_captain_or_treasurer(society_id));

-- Insert policy: Captain or Treasurer can insert finance entries
DROP POLICY IF EXISTS finance_entries_insert ON public.finance_entries;
CREATE POLICY finance_entries_insert ON public.finance_entries
  FOR INSERT
  WITH CHECK (is_captain_or_treasurer(society_id));

-- Update policy: Captain or Treasurer can update finance entries
DROP POLICY IF EXISTS finance_entries_update ON public.finance_entries;
CREATE POLICY finance_entries_update ON public.finance_entries
  FOR UPDATE
  USING (is_captain_or_treasurer(society_id))
  WITH CHECK (is_captain_or_treasurer(society_id));

-- Delete policy: Captain or Treasurer can delete finance entries
DROP POLICY IF EXISTS finance_entries_delete ON public.finance_entries;
CREATE POLICY finance_entries_delete ON public.finance_entries
  FOR DELETE
  USING (is_captain_or_treasurer(society_id));

-- =====================================================
-- 6. UPDATE SOCIETIES RLS FOR OPENING BALANCE
-- =====================================================

-- Allow Captain or Treasurer to update opening_balance_pence
-- This extends the existing update policy on societies
-- The existing policy should already allow Captain/Treasurer to update,
-- but we ensure opening_balance_pence is included

-- Note: If the existing policy doesn't cover this, you may need to:
-- DROP POLICY IF EXISTS societies_update_finance ON public.societies;
-- CREATE POLICY societies_update_finance ON public.societies
--   FOR UPDATE
--   USING (is_captain_or_treasurer(id))
--   WITH CHECK (is_captain_or_treasurer(id));

-- =====================================================
-- 7. GRANTS
-- =====================================================

-- Grant permissions to authenticated users (RLS will filter)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_entries TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
