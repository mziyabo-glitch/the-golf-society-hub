-- =====================================================
-- FIX OOM CHAMPIONS RLS
-- Use has_role_in_society (same as events) for consistency
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS oom_champions_select_member ON public.oom_champions;
DROP POLICY IF EXISTS oom_champions_insert_manco ON public.oom_champions;
DROP POLICY IF EXISTS oom_champions_update_manco ON public.oom_champions;
DROP POLICY IF EXISTS oom_champions_delete_manco ON public.oom_champions;

-- SELECT: Society members can read (same pattern as event_results)
CREATE POLICY oom_champions_select_member
  ON public.oom_champions
  FOR SELECT
  TO authenticated
  USING (society_id IN (SELECT public.my_society_ids()));

-- INSERT: Captain or Secretary can insert (same pattern as events)
CREATE POLICY oom_champions_insert_manco
  ON public.oom_champions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain', 'secretary'])
  );

-- UPDATE: Captain or Secretary can update
CREATE POLICY oom_champions_update_manco
  ON public.oom_champions
  FOR UPDATE
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain', 'secretary'])
  )
  WITH CHECK (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain', 'secretary'])
  );

-- DELETE: Captain or Secretary can delete
CREATE POLICY oom_champions_delete_manco
  ON public.oom_champions
  FOR DELETE
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain', 'secretary'])
  );
