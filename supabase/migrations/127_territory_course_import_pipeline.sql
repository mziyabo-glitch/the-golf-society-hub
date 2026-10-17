-- Territory-scale course import pipeline foundations:
-- - batch-level nightly summaries
-- - candidate discovery/queue table
-- - territory/phase metadata on courses and jobs

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS territory text,
  ADD COLUMN IF NOT EXISTS discovery_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS seeded_status text NOT NULL DEFAULT 'unseeded',
  ADD COLUMN IF NOT EXISTS seed_phase text,
  ADD COLUMN IF NOT EXISTS discovery_source text,
  ADD COLUMN IF NOT EXISTS canonical_api_id bigint,
  ADD COLUMN IF NOT EXISTS import_priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refresh_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_discovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_discovered_at timestamptz;

UPDATE public.courses
SET canonical_api_id = api_id
WHERE canonical_api_id IS NULL
  AND api_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courses_discovery_status_chk'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_discovery_status_chk
      CHECK (discovery_status IN ('unknown', 'discovered', 'queued', 'resolved', 'rejected'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courses_seeded_status_chk'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_seeded_status_chk
      CHECK (seeded_status IN ('unseeded', 'seeded', 'refresh_due', 'retired'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courses_seed_phase_chk'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_seed_phase_chk
      CHECK (seed_phase IS NULL OR seed_phase IN ('england_wales', 'scotland', 'ireland'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_seed_phase ON public.courses(seed_phase);
CREATE INDEX IF NOT EXISTS idx_courses_territory ON public.courses(territory);
CREATE INDEX IF NOT EXISTS idx_courses_refresh_due_at ON public.courses(refresh_due_at);
CREATE INDEX IF NOT EXISTS idx_courses_seeded_status ON public.courses(seeded_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_canonical_api_id_unique
  ON public.courses(canonical_api_id)
  WHERE canonical_api_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.course_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  mode text NOT NULL DEFAULT 'territory_nightly',
  territory text NOT NULL DEFAULT 'uk',
  seed_phase text NOT NULL DEFAULT 'england_wales',
  trigger_type text NOT NULL DEFAULT 'nightly',
  max_priority integer NOT NULL DEFAULT 15,
  max_new_seeds integer NOT NULL DEFAULT 20,
  max_retries integer NOT NULL DEFAULT 15,
  max_refreshes integer NOT NULL DEFAULT 30,
  total_candidates integer NOT NULL DEFAULT 0,
  total_attempted integer NOT NULL DEFAULT 0,
  total_inserted integer NOT NULL DEFAULT 0,
  total_updated integer NOT NULL DEFAULT 0,
  total_ok integer NOT NULL DEFAULT 0,
  total_partial integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  total_skipped integer NOT NULL DEFAULT 0,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_import_batches_status_chk
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT course_import_batches_phase_chk
    CHECK (seed_phase IN ('england_wales', 'scotland', 'ireland'))
);

CREATE INDEX IF NOT EXISTS idx_course_import_batches_started_at
  ON public.course_import_batches(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_import_batches_phase_status
  ON public.course_import_batches(seed_phase, status, started_at DESC);

DROP TRIGGER IF EXISTS trg_course_import_batches_updated ON public.course_import_batches;
CREATE TRIGGER trg_course_import_batches_updated
  BEFORE UPDATE ON public.course_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.course_import_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_name text NOT NULL,
  normalized_name text NOT NULL,
  country text,
  territory text NOT NULL DEFAULT 'uk',
  seed_phase text NOT NULL DEFAULT 'england_wales',
  discovery_source text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  canonical_api_id bigint,
  canonical_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  import_priority integer NOT NULL DEFAULT 0,
  refresh_due_at timestamptz,
  first_discovered_at timestamptz NOT NULL DEFAULT now(),
  last_discovered_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  sync_status text NOT NULL DEFAULT 'queued',
  confidence_score numeric(5,2),
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_import_candidates_status_chk
    CHECK (status IN ('queued', 'resolved', 'imported', 'rejected', 'failed', 'skipped')),
  CONSTRAINT course_import_candidates_sync_status_chk
    CHECK (sync_status IN ('queued', 'running', 'ok', 'partial', 'failed', 'skipped')),
  CONSTRAINT course_import_candidates_phase_chk
    CHECK (seed_phase IN ('england_wales', 'scotland', 'ireland'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_import_candidates_api_territory_unique
  ON public.course_import_candidates(territory, canonical_api_id)
  WHERE canonical_api_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_import_candidates_name_territory_unique
  ON public.course_import_candidates(territory, normalized_name);

CREATE INDEX IF NOT EXISTS idx_course_import_candidates_status_priority
  ON public.course_import_candidates(status, import_priority DESC, last_discovered_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_import_candidates_retry_due
  ON public.course_import_candidates(status, next_retry_at, retry_count);

CREATE INDEX IF NOT EXISTS idx_course_import_candidates_refresh_due
  ON public.course_import_candidates(status, refresh_due_at);

DROP TRIGGER IF EXISTS trg_course_import_candidates_updated ON public.course_import_candidates;
CREATE TRIGGER trg_course_import_candidates_updated
  BEFORE UPDATE ON public.course_import_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.course_import_jobs
  ADD COLUMN IF NOT EXISTS batch_run_id uuid,
  ADD COLUMN IF NOT EXISTS candidate_id uuid,
  ADD COLUMN IF NOT EXISTS seed_phase text,
  ADD COLUMN IF NOT EXISTS territory text,
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'legacy_nightly';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'course_import_jobs_seed_phase_chk'
  ) THEN
    ALTER TABLE public.course_import_jobs
      ADD CONSTRAINT course_import_jobs_seed_phase_chk
      CHECK (seed_phase IS NULL OR seed_phase IN ('england_wales', 'scotland', 'ireland'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'course_import_jobs_mode_chk'
  ) THEN
    ALTER TABLE public.course_import_jobs
      ADD CONSTRAINT course_import_jobs_mode_chk
      CHECK (mode IS NULL OR mode IN ('legacy_nightly', 'territory_nightly', 'manual'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'course_import_jobs_batch_run_id_fkey'
  ) THEN
    ALTER TABLE public.course_import_jobs
      ADD CONSTRAINT course_import_jobs_batch_run_id_fkey
      FOREIGN KEY (batch_run_id)
      REFERENCES public.course_import_batches(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'course_import_jobs_candidate_id_fkey'
  ) THEN
    ALTER TABLE public.course_import_jobs
      ADD CONSTRAINT course_import_jobs_candidate_id_fkey
      FOREIGN KEY (candidate_id)
      REFERENCES public.course_import_candidates(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_course_import_jobs_batch_run_id
  ON public.course_import_jobs(batch_run_id);
CREATE INDEX IF NOT EXISTS idx_course_import_jobs_candidate_id
  ON public.course_import_jobs(candidate_id);

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

ALTER TABLE public.course_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_import_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_import_batches_select_admin ON public.course_import_batches;
CREATE POLICY course_import_batches_select_admin ON public.course_import_batches
  FOR SELECT TO authenticated
  USING (public.can_manage_course_data());

DROP POLICY IF EXISTS course_import_batches_insert_admin ON public.course_import_batches;
CREATE POLICY course_import_batches_insert_admin ON public.course_import_batches
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_course_data());

DROP POLICY IF EXISTS course_import_batches_update_admin ON public.course_import_batches;
CREATE POLICY course_import_batches_update_admin ON public.course_import_batches
  FOR UPDATE TO authenticated
  USING (public.can_manage_course_data())
  WITH CHECK (public.can_manage_course_data());

DROP POLICY IF EXISTS course_import_candidates_select_admin ON public.course_import_candidates;
CREATE POLICY course_import_candidates_select_admin ON public.course_import_candidates
  FOR SELECT TO authenticated
  USING (public.can_manage_course_data());

DROP POLICY IF EXISTS course_import_candidates_insert_admin ON public.course_import_candidates;
CREATE POLICY course_import_candidates_insert_admin ON public.course_import_candidates
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_course_data());

DROP POLICY IF EXISTS course_import_candidates_update_admin ON public.course_import_candidates;
CREATE POLICY course_import_candidates_update_admin ON public.course_import_candidates
  FOR UPDATE TO authenticated
  USING (public.can_manage_course_data())
  WITH CHECK (public.can_manage_course_data());

NOTIFY pgrst, 'reload schema';
