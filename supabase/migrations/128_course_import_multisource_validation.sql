-- Multi-source validation support for nightly course import:
-- - confidence materialized on `courses`
-- - staging table for low-confidence candidate imports

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS data_confidence text NOT NULL DEFAULT 'medium';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_data_confidence_chk'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_data_confidence_chk
      CHECK (data_confidence IN ('high', 'medium', 'low'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_data_confidence
  ON public.courses(data_confidence);

CREATE TABLE IF NOT EXISTS public.course_import_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  batch_run_id uuid REFERENCES public.course_import_batches(id) ON DELETE SET NULL,
  candidate_id uuid REFERENCES public.course_import_candidates(id) ON DELETE SET NULL,
  territory text NOT NULL DEFAULT 'uk',
  phase text NOT NULL DEFAULT 'england_wales',
  api_id bigint,
  candidate_name text,
  course_name text NOT NULL,
  confidence text NOT NULL DEFAULT 'low',
  failure_reason text NOT NULL,
  comparison_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'rejected_low_confidence',
  reviewed_at timestamptz,
  resolved_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_import_staging_confidence_chk'
  ) THEN
    ALTER TABLE public.course_import_staging
      ADD CONSTRAINT course_import_staging_confidence_chk
      CHECK (confidence IN ('high', 'medium', 'low'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_import_staging_phase_chk'
  ) THEN
    ALTER TABLE public.course_import_staging
      ADD CONSTRAINT course_import_staging_phase_chk
      CHECK (phase IN ('england_wales', 'scotland', 'ireland'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_course_import_staging_created_at
  ON public.course_import_staging(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_import_staging_status_confidence
  ON public.course_import_staging(status, confidence, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_import_staging_batch
  ON public.course_import_staging(batch_run_id, created_at DESC);

