-- Immutable per-hole layout for an event at lock-in (tee attach). Scoring must not read live course_holes.

CREATE TABLE IF NOT EXISTS public.event_course_holes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  hole_number integer NOT NULL,
  par integer NOT NULL,
  yardage integer NOT NULL,
  stroke_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_course_holes_event_hole_unique UNIQUE (event_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_event_course_holes_event_id ON public.event_course_holes(event_id);

COMMENT ON TABLE public.event_course_holes IS 'Snapshot of course_holes for the event''s tee at attach time; replaced on re-attach.';

ALTER TABLE public.event_course_holes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_course_holes_select ON public.event_course_holes;
CREATE POLICY event_course_holes_select ON public.event_course_holes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_course_holes.event_id
    )
  );

DROP POLICY IF EXISTS event_course_holes_insert ON public.event_course_holes;
CREATE POLICY event_course_holes_insert ON public.event_course_holes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_course_holes.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

DROP POLICY IF EXISTS event_course_holes_update ON public.event_course_holes;
CREATE POLICY event_course_holes_update ON public.event_course_holes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_course_holes.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_course_holes.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

DROP POLICY IF EXISTS event_course_holes_delete ON public.event_course_holes;
CREATE POLICY event_course_holes_delete ON public.event_course_holes
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_course_holes.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

NOTIFY pgrst, 'reload schema';
