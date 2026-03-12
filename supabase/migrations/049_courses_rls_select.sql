-- Allow app to read courses (course search in event creation).
-- Without this, if RLS is enabled on courses, SELECT returns no rows.

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courses_select_all ON public.courses;
CREATE POLICY courses_select_all ON public.courses FOR SELECT TO anon, authenticated USING (true);

-- Allow inserts for course import scripts / backend
DROP POLICY IF EXISTS courses_insert_all ON public.courses;
CREATE POLICY courses_insert_all ON public.courses FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS courses_update_all ON public.courses;
CREATE POLICY courses_update_all ON public.courses FOR UPDATE TO anon, authenticated USING (true);
