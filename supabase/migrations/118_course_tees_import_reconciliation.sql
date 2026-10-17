-- Importer reconciliation: archive or remove course_tees rows that are no longer in the GolfCourseAPI
-- normalized set, without breaking historical FKs (events / event_courses / event_entries).

ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

COMMENT ON COLUMN public.course_tees.is_active IS
  'When false, tee is excluded from active pickers (stale vs current import). Historical events may still reference the row.';
COMMENT ON COLUMN public.course_tees.deactivated_at IS
  'Set when is_active becomes false due to import reconciliation.';

CREATE INDEX IF NOT EXISTS idx_course_tees_course_id_active
  ON public.course_tees (course_id)
  WHERE is_active = true;

NOTIFY pgrst, 'reload schema';
