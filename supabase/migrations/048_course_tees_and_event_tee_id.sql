-- Course tees: store tees per course (e.g. from GolfCourseAPI import)
-- Events can reference a tee by tee_id and denormalize rating/slope/par for display.

CREATE TABLE IF NOT EXISTS public.course_tees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  tee_name text NOT NULL,
  tee_color text,
  course_rating numeric(4,1) NOT NULL CHECK (course_rating >= 50 AND course_rating <= 90),
  slope_rating integer NOT NULL CHECK (slope_rating >= 55 AND slope_rating <= 155),
  par_total integer NOT NULL CHECK (par_total >= 27 AND par_total <= 90),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_tees_course_id ON public.course_tees(course_id);

COMMENT ON TABLE public.course_tees IS 'Tees per course for WHS (rating, slope, par). Filled when course is imported e.g. from GolfCourseAPI.';

-- Allow app to read course_tees (society members creating events)
ALTER TABLE public.course_tees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_tees_select_all ON public.course_tees;
CREATE POLICY course_tees_select_all ON public.course_tees FOR SELECT TO anon, authenticated USING (true);

-- Insert/update for backend/scripts (e.g. course import)
DROP POLICY IF EXISTS course_tees_insert_all ON public.course_tees;
CREATE POLICY course_tees_insert_all ON public.course_tees FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS course_tees_update_all ON public.course_tees;
CREATE POLICY course_tees_update_all ON public.course_tees FOR UPDATE TO anon, authenticated USING (true);

-- Add tee_id to events (optional: when captain selects a tee from course_tees)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'tee_id'
  ) THEN
    ALTER TABLE public.events ADD COLUMN tee_id uuid REFERENCES public.course_tees(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.events.tee_id IS 'Selected tee from course_tees when course is from API; denormalized tee_name/par/course_rating/slope_rating still stored on event.';
