-- Course import admin policy hardening:
-- - limit course_import_jobs and course_manual_overrides to admin roles
-- - captain / secretary / handicapper can manage course-data admin workflows

CREATE OR REPLACE FUNCTION public.can_manage_course_data()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.user_id = auth.uid()
      AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_course_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_course_data() TO authenticated;

DROP POLICY IF EXISTS course_import_jobs_select_authenticated ON public.course_import_jobs;
DROP POLICY IF EXISTS course_import_jobs_insert_authenticated ON public.course_import_jobs;
DROP POLICY IF EXISTS course_import_jobs_update_authenticated ON public.course_import_jobs;

CREATE POLICY course_import_jobs_select_admin ON public.course_import_jobs
  FOR SELECT TO authenticated
  USING (public.can_manage_course_data());

CREATE POLICY course_import_jobs_insert_admin ON public.course_import_jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_course_data());

CREATE POLICY course_import_jobs_update_admin ON public.course_import_jobs
  FOR UPDATE TO authenticated
  USING (public.can_manage_course_data())
  WITH CHECK (public.can_manage_course_data());

DROP POLICY IF EXISTS course_manual_overrides_select_authenticated ON public.course_manual_overrides;
DROP POLICY IF EXISTS course_manual_overrides_insert_authenticated ON public.course_manual_overrides;
DROP POLICY IF EXISTS course_manual_overrides_update_authenticated ON public.course_manual_overrides;
DROP POLICY IF EXISTS course_manual_overrides_delete_authenticated ON public.course_manual_overrides;

CREATE POLICY course_manual_overrides_select_admin ON public.course_manual_overrides
  FOR SELECT TO authenticated
  USING (public.can_manage_course_data());

CREATE POLICY course_manual_overrides_insert_admin ON public.course_manual_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_course_data());

CREATE POLICY course_manual_overrides_update_admin ON public.course_manual_overrides
  FOR UPDATE TO authenticated
  USING (public.can_manage_course_data())
  WITH CHECK (public.can_manage_course_data());

CREATE POLICY course_manual_overrides_delete_admin ON public.course_manual_overrides
  FOR DELETE TO authenticated
  USING (public.can_manage_course_data());

NOTIFY pgrst, 'reload schema';
