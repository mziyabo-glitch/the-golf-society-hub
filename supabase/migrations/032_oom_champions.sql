-- =====================================================
-- OOM CHAMPIONS (Roll of Honour)
-- Table, RLS, and storage for society OOM champions by season
-- =====================================================

-- =====================================================
-- TABLE: oom_champions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.oom_champions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  season_year integer NOT NULL,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  bio text,
  photo_url text,
  points_total numeric(10, 2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(society_id, season_year)
);

CREATE INDEX IF NOT EXISTS idx_oom_champions_society_year
  ON public.oom_champions(society_id, season_year DESC);

-- =====================================================
-- HELPER: Check if user can manage OOM champions
-- =====================================================
CREATE OR REPLACE FUNCTION can_manage_oom_champions(p_society_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.members
    WHERE society_id = p_society_id
      AND user_id = auth.uid()
      AND LOWER(role) IN ('captain', 'secretary')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- HELPER: Check if user is society member (can read)
-- =====================================================
CREATE OR REPLACE FUNCTION is_society_member(p_society_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.members
    WHERE society_id = p_society_id
      AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE public.oom_champions ENABLE ROW LEVEL SECURITY;

-- SELECT: Society members can read
CREATE POLICY oom_champions_select_member
  ON public.oom_champions
  FOR SELECT
  TO authenticated
  USING (is_society_member(society_id));

-- INSERT: Only Captain/Secretary can insert
CREATE POLICY oom_champions_insert_manco
  ON public.oom_champions
  FOR INSERT
  TO authenticated
  WITH CHECK (can_manage_oom_champions(society_id));

-- UPDATE: Only Captain/Secretary can update
CREATE POLICY oom_champions_update_manco
  ON public.oom_champions
  FOR UPDATE
  TO authenticated
  USING (can_manage_oom_champions(society_id))
  WITH CHECK (can_manage_oom_champions(society_id));

-- DELETE: Only Captain/Secretary can delete
CREATE POLICY oom_champions_delete_manco
  ON public.oom_champions
  FOR DELETE
  TO authenticated
  USING (can_manage_oom_champions(society_id));

-- =====================================================
-- STORAGE BUCKET: oom-champions
-- Path: societies/{society_id}/oom/{champion_id}.{ext}
-- =====================================================
-- Create bucket via Dashboard: Storage > Create bucket > oom-champions (public)
-- Or use Supabase API. Policies below assume bucket exists.

-- Storage policies (run after bucket creation):
-- 1. SELECT: Allow authenticated read for society members
-- 2. INSERT: Captain/Secretary only, path must match society they manage
-- 3. DELETE: Captain/Secretary only

-- Note: Storage policies are typically configured in Dashboard.
-- For reference, the path pattern is: societies/{society_id}/oom/{filename}

-- =====================================================
-- UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION set_oom_champions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS oom_champions_updated_at ON public.oom_champions;
CREATE TRIGGER oom_champions_updated_at
  BEFORE UPDATE ON public.oom_champions
  FOR EACH ROW
  EXECUTE FUNCTION set_oom_champions_updated_at();

-- =====================================================
-- GRANTS
-- =====================================================
GRANT EXECUTE ON FUNCTION public.can_manage_oom_champions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_society_member(uuid) TO authenticated;

-- =====================================================
-- STORAGE BUCKET SETUP (manual in Supabase Dashboard)
-- =====================================================
-- 1. Storage > New bucket > Name: oom-champions, Public: true
-- 2. Path pattern: societies/{society_id}/oom/{champion_id}.{ext}
-- 3. Add policy: INSERT for authenticated where
--    bucket_id = 'oom-champions' AND (storage.foldername(name))[2]::uuid IN
--    (SELECT society_id FROM members WHERE user_id = auth.uid() AND LOWER(role) IN ('captain','secretary'))
-- 4. Public bucket allows SELECT by default
