-- Course import jobs table + enrichment status for background pipeline
-- Supports: on-demand seeding, background enrichment, manual override safety

-- 1. course_import_jobs table
CREATE TABLE IF NOT EXISTS public.course_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('import_holes', 'dedupe_course', 'refresh_course')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_course_import_jobs_status
  ON public.course_import_jobs(status)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_course_import_jobs_course_id
  ON public.course_import_jobs(course_id);

CREATE INDEX IF NOT EXISTS idx_course_import_jobs_created_at
  ON public.course_import_jobs(created_at);

-- Prevent duplicate pending jobs for same course+type
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_import_jobs_pending_unique
  ON public.course_import_jobs(course_id, job_type)
  WHERE status = 'pending';

COMMENT ON TABLE public.course_import_jobs IS 'Background job queue for course enrichment (holes, dedupe, refresh)';

-- 2. Enrichment status on courses
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'courses') THEN
    ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT 'seeded';
    ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS enrichment_updated_at timestamptz;
  END IF;
END $$;

-- enrichment_status: seeded | tees_loaded | holes_loaded | verified
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'enrichment_status') THEN
    ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_enrichment_status_check;
    ALTER TABLE public.courses ADD CONSTRAINT courses_enrichment_status_check
      CHECK (enrichment_status IS NULL OR enrichment_status IN ('seeded', 'tees_loaded', 'holes_loaded', 'verified'));
  END IF;
END $$;

COMMENT ON COLUMN public.courses.enrichment_status IS 'Completeness: seeded (basic), tees_loaded, holes_loaded, verified';

-- 3. Manual override safety on course_tees
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'course_tees') THEN
    ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS is_manual_override boolean DEFAULT false;
    ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS verified_at timestamptz;
    ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS source text DEFAULT 'imported';
  END IF;
END $$;

-- source: imported | manual | mixed
COMMENT ON COLUMN public.course_tees.is_manual_override IS 'Do not overwrite when background import runs';
COMMENT ON COLUMN public.course_tees.source IS 'imported | manual | mixed';

-- 4. RLS for course_import_jobs (service role only for worker; authenticated can read)
ALTER TABLE public.course_import_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_import_jobs' AND policyname = 'course_import_jobs_select_authenticated') THEN
    CREATE POLICY course_import_jobs_select_authenticated
      ON public.course_import_jobs FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_import_jobs' AND policyname = 'course_import_jobs_insert_authenticated') THEN
    CREATE POLICY course_import_jobs_insert_authenticated
      ON public.course_import_jobs FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_import_jobs' AND policyname = 'course_import_jobs_all_service') THEN
    CREATE POLICY course_import_jobs_all_service
      ON public.course_import_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
