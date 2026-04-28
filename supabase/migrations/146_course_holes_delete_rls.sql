-- course_holes had SELECT/INSERT/UPDATE for authenticated but no DELETE policy.
-- Under RLS, DELETE then matched zero rows silently, leaving holes in place and breaking re-import.

DROP POLICY IF EXISTS course_holes_delete_authenticated ON public.course_holes;
CREATE POLICY course_holes_delete_authenticated
  ON public.course_holes
  FOR DELETE
  TO authenticated
  USING (true);

COMMENT ON POLICY course_holes_delete_authenticated ON public.course_holes IS
  'Allows authenticated clients to delete hole rows when re-importing a course (same scope as INSERT).';
