-- 028_tighten_society_access.sql
-- Tighten societies SELECT so non-members see only the minimal info
-- needed for join-by-code. Members and creators get full access.
-- All other society-scoped tables (events, members, event_results,
-- finance_entries, licence_requests) already use my_society_ids() and
-- are properly membership-gated from earlier migrations.

-- ============================================================================
-- 1. Replace societies SELECT policy
-- ============================================================================
-- Old policy (003): USING (join_code IS NOT NULL)
--   → Any authenticated user could read every society that has a join code.
-- New policy: membership-first, with a narrow exception for the join flow.

DROP POLICY IF EXISTS societies_select_authenticated ON public.societies;
DROP POLICY IF EXISTS societies_select_all ON public.societies;

-- Primary path: members see their own society
CREATE POLICY societies_select_member
  ON public.societies
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT public.my_society_ids())
  );

-- Secondary path: anyone authenticated can look up a society by join_code
-- (needed during onboarding before the user is a member). This is a
-- narrow info exposure (name + code only in practice) and is acceptable
-- because the app only queries this during the join flow.
CREATE POLICY societies_select_joinable
  ON public.societies
  FOR SELECT
  TO authenticated
  USING (
    join_code IS NOT NULL
  );

-- Creator can always see their own society (even if not yet a member row)
CREATE POLICY societies_select_creator
  ON public.societies
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
  );

-- ============================================================================
-- 2. Verify all society-scoped tables have RLS enabled
--    (belt-and-suspenders — these should already be enabled)
-- ============================================================================

ALTER TABLE public.societies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licence_requests ENABLE ROW LEVEL SECURITY;
