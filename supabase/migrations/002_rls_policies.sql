-- =====================================================
-- RLS POLICIES FOR GOLF SOCIETY HUB
-- Run this in Supabase SQL Editor
-- =====================================================

-- IMPORTANT: First enable anonymous sign-ins in Supabase Dashboard:
-- Authentication > Settings > Auth Providers > Anonymous Sign-Ins > Enable

-- =====================================================
-- SOCIETIES TABLE
-- =====================================================

-- Enable RLS on societies
ALTER TABLE public.societies ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running)
DROP POLICY IF EXISTS societies_select_all ON public.societies;
DROP POLICY IF EXISTS societies_insert_creator ON public.societies;
DROP POLICY IF EXISTS societies_update_creator ON public.societies;
DROP POLICY IF EXISTS societies_delete_creator ON public.societies;

-- Anyone authenticated can read societies (needed for join by code)
CREATE POLICY societies_select_all
  ON public.societies
  FOR SELECT
  TO authenticated
  USING (true);

-- Only the creator can insert (created_by must match auth.uid())
CREATE POLICY societies_insert_creator
  ON public.societies
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Only the creator can update their society
CREATE POLICY societies_update_creator
  ON public.societies
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Only the creator can delete their society
CREATE POLICY societies_delete_creator
  ON public.societies
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- =====================================================
-- PROFILES TABLE
-- =====================================================

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

-- Users can only see their own profile
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
-- MEMBERS TABLE
-- =====================================================

-- Enable RLS on members
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS members_select_society ON public.members;
DROP POLICY IF EXISTS members_insert_authenticated ON public.members;
DROP POLICY IF EXISTS members_update_society ON public.members;
DROP POLICY IF EXISTS members_delete_society ON public.members;

-- Members can be read by anyone in the same society
-- (We check if the reader is a member of the same society)
CREATE POLICY members_select_society
  ON public.members
  FOR SELECT
  TO authenticated
  USING (
    society_id IN (
      SELECT society_id FROM public.members WHERE user_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Any authenticated user can create a member record
-- (for joining a society)
CREATE POLICY members_insert_authenticated
  ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Members can be updated by members of the same society
CREATE POLICY members_update_society
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (
    society_id IN (
      SELECT society_id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- Members can be deleted by members of the same society
CREATE POLICY members_delete_society
  ON public.members
  FOR DELETE
  TO authenticated
  USING (
    society_id IN (
      SELECT society_id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- EVENTS TABLE
-- =====================================================

-- Enable RLS on events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS events_select_society ON public.events;
DROP POLICY IF EXISTS events_insert_society ON public.events;
DROP POLICY IF EXISTS events_update_society ON public.events;
DROP POLICY IF EXISTS events_delete_society ON public.events;

-- Events can be read by society members
CREATE POLICY events_select_society
  ON public.events
  FOR SELECT
  TO authenticated
  USING (
    society_id IN (
      SELECT society_id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- Events can be created by society members
CREATE POLICY events_insert_society
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    society_id IN (
      SELECT society_id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- Events can be updated by society members
CREATE POLICY events_update_society
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    society_id IN (
      SELECT society_id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- Events can be deleted by society members
CREATE POLICY events_delete_society
  ON public.events
  FOR DELETE
  TO authenticated
  USING (
    society_id IN (
      SELECT society_id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- VERIFICATION QUERY
-- Run this to verify policies are set up correctly
-- =====================================================

-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
