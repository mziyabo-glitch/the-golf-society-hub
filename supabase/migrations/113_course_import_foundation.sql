-- GolfCourseAPI import foundation: enrichment columns, tee metadata for WHS/scoring, event_course lock row.

-- ---------------------------------------------------------------------------
-- courses: optional display / geocode / import provenance (additive only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS normalized_name text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS source_country_code text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS enrichment_status text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS raw_row jsonb;

COMMENT ON COLUMN public.courses.full_name IS 'Display: club + course when distinct; used for pickers and labels.';
COMMENT ON COLUMN public.courses.raw_row IS 'Optional GolfCourseAPI payload fragment for debugging re-imports; not authoritative.';

-- ---------------------------------------------------------------------------
-- course_tees: WHS / scoring-related fields (bogey rating, order, default flag)
-- ---------------------------------------------------------------------------
ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS bogey_rating double precision;
ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS total_meters integer;
ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.course_tees.bogey_rating IS 'WHS bogey rating when provided by API; used with course_rating/slope for handicap strokes.';
COMMENT ON COLUMN public.course_tees.display_order IS 'Stable sort for tee pickers (lower = first).';
COMMENT ON COLUMN public.course_tees.is_default IS 'Importer marks primary men''s / first tee as default when API does not.';

-- ---------------------------------------------------------------------------
-- event_courses: optional canonical lock of event → course + tee (audit / future multi-loop)
-- events.course_id / events.tee_id remain the live FKs the app uses today.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  tee_id uuid NOT NULL REFERENCES public.course_tees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_courses_one_per_event UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_courses_course_id ON public.event_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_event_courses_tee_id ON public.event_courses(tee_id);

ALTER TABLE public.event_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_courses_select ON public.event_courses;
CREATE POLICY event_courses_select ON public.event_courses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_courses.event_id
    )
  );

DROP POLICY IF EXISTS event_courses_insert ON public.event_courses;
CREATE POLICY event_courses_insert ON public.event_courses
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_courses.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

DROP POLICY IF EXISTS event_courses_update ON public.event_courses;
CREATE POLICY event_courses_update ON public.event_courses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_courses.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_courses.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

DROP POLICY IF EXISTS event_courses_delete ON public.event_courses;
CREATE POLICY event_courses_delete ON public.event_courses
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_courses.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

COMMENT ON TABLE public.event_courses IS 'Snapshot row when an event locks to imported course + tee; mirrors events.course_id/tee_id for scoring pipelines.';

NOTIFY pgrst, 'reload schema';
