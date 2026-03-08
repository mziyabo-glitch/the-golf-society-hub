-- 039_course_enrichment_phase2.sql
-- Phase 2: tee/rating enrichment workflow for shared course library

-- ---------------------------------------------------------------------
-- Helper: can current user manage course enrichment workflows?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_manage_course_enrichment()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.user_id = auth.uid()
      AND LOWER(COALESCE(m.role, '')) IN ('captain', 'secretary', 'handicapper')
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_manage_course_enrichment() TO authenticated;

COMMENT ON FUNCTION public.user_can_manage_course_enrichment() IS
  'Returns true when authenticated user is Captain/Secretary/Handicapper in any society.';

-- ---------------------------------------------------------------------
-- Add enrichment metadata fields to courses
-- ---------------------------------------------------------------------
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS matched_source text,
  ADD COLUMN IF NOT EXISTS matched_name text,
  ADD COLUMN IF NOT EXISTS match_confidence numeric,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

CREATE INDEX IF NOT EXISTS courses_enrichment_status_idx
  ON public.courses (enrichment_status);

CREATE INDEX IF NOT EXISTS courses_match_confidence_idx
  ON public.courses (match_confidence DESC);

-- ---------------------------------------------------------------------
-- Tee sets per course
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  tee_name text NOT NULL,
  tee_color text,
  gender text,
  par integer,
  course_rating numeric,
  slope_rating integer,
  source text,
  source_ref text,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tees_course_source_ref_unique_idx
  ON public.tees (course_id, source, source_ref);

CREATE INDEX IF NOT EXISTS tees_course_idx
  ON public.tees (course_id);

CREATE INDEX IF NOT EXISTS tees_course_gender_idx
  ON public.tees (course_id, gender);

-- ---------------------------------------------------------------------
-- Enrichment run audit trail
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_enrichment_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  status text NOT NULL,
  source text,
  notes text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_enrichment_runs_course_created_idx
  ON public.course_enrichment_runs (course_id, created_at DESC);

CREATE INDEX IF NOT EXISTS course_enrichment_runs_status_idx
  ON public.course_enrichment_runs (status);

-- ---------------------------------------------------------------------
-- Persist selected tee on events
-- ---------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS tee_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_tee_id_fkey'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_tee_id_fkey
      FOREIGN KEY (tee_id)
      REFERENCES public.tees(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS events_tee_id_idx
  ON public.events (tee_id);

-- ---------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------
ALTER TABLE public.tees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrichment_runs ENABLE ROW LEVEL SECURITY;

-- Course reads remain open to authenticated users; updates restricted.
DROP POLICY IF EXISTS courses_update_enrichment_manager ON public.courses;
CREATE POLICY courses_update_enrichment_manager
  ON public.courses
  FOR UPDATE
  TO authenticated
  USING (public.user_can_manage_course_enrichment())
  WITH CHECK (public.user_can_manage_course_enrichment());

DROP POLICY IF EXISTS tees_select_authenticated ON public.tees;
CREATE POLICY tees_select_authenticated
  ON public.tees
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS tees_insert_enrichment_manager ON public.tees;
CREATE POLICY tees_insert_enrichment_manager
  ON public.tees
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_manage_course_enrichment());

DROP POLICY IF EXISTS tees_update_enrichment_manager ON public.tees;
CREATE POLICY tees_update_enrichment_manager
  ON public.tees
  FOR UPDATE
  TO authenticated
  USING (public.user_can_manage_course_enrichment())
  WITH CHECK (public.user_can_manage_course_enrichment());

DROP POLICY IF EXISTS tees_delete_enrichment_manager ON public.tees;
CREATE POLICY tees_delete_enrichment_manager
  ON public.tees
  FOR DELETE
  TO authenticated
  USING (public.user_can_manage_course_enrichment());

DROP POLICY IF EXISTS course_enrichment_runs_select_enrichment_manager ON public.course_enrichment_runs;
CREATE POLICY course_enrichment_runs_select_enrichment_manager
  ON public.course_enrichment_runs
  FOR SELECT
  TO authenticated
  USING (public.user_can_manage_course_enrichment());

DROP POLICY IF EXISTS course_enrichment_runs_insert_enrichment_manager ON public.course_enrichment_runs;
CREATE POLICY course_enrichment_runs_insert_enrichment_manager
  ON public.course_enrichment_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_manage_course_enrichment());
