-- Nightly course import engine foundation:
-- - provenance/sync columns on courses/tees/holes
-- - import job logging table
-- - manual overrides table (manual values win over imports)

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(5,2);

ALTER TABLE public.course_tees
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(5,2);

ALTER TABLE public.course_holes
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courses_sync_status_chk'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_sync_status_chk
      CHECK (sync_status IN ('idle', 'ok', 'partial', 'failed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'course_tees_sync_status_chk'
  ) THEN
    ALTER TABLE public.course_tees
      ADD CONSTRAINT course_tees_sync_status_chk
      CHECK (sync_status IN ('idle', 'ok', 'partial', 'failed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'course_holes_sync_status_chk'
  ) THEN
    ALTER TABLE public.course_holes
      ADD CONSTRAINT course_holes_sync_status_chk
      CHECK (sync_status IN ('idle', 'ok', 'partial', 'failed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_holes_course_tee_hole_unique
  ON public.course_holes(course_id, tee_id, hole_number);

CREATE TABLE IF NOT EXISTS public.course_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL DEFAULT 'manual',
  target_course_name text,
  target_api_id bigint,
  target_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  source_type text,
  source_url text,
  sync_status text NOT NULL DEFAULT 'idle',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  imported_at timestamptz,
  confidence_score numeric(5,2),
  validation_errors jsonb,
  raw_source_payload jsonb,
  summary jsonb,
  error_message text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.course_import_jobs
  ADD COLUMN IF NOT EXISTS batch_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS trigger_type text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS target_course_name text,
  ADD COLUMN IF NOT EXISTS target_api_id bigint,
  ADD COLUMN IF NOT EXISTS target_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(5,2),
  ADD COLUMN IF NOT EXISTS validation_errors jsonb,
  ADD COLUMN IF NOT EXISTS raw_source_payload jsonb,
  ADD COLUMN IF NOT EXISTS summary jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.course_import_jobs SET sync_status = 'idle' WHERE sync_status IS NULL;

ALTER TABLE public.course_import_jobs
  ALTER COLUMN batch_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN trigger_type SET DEFAULT 'manual',
  ALTER COLUMN sync_status SET DEFAULT 'idle',
  ALTER COLUMN started_at SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.course_import_jobs
  ALTER COLUMN batch_id SET NOT NULL,
  ALTER COLUMN trigger_type SET NOT NULL,
  ALTER COLUMN sync_status SET NOT NULL,
  ALTER COLUMN started_at SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'course_import_jobs_sync_status_chk'
  ) THEN
    ALTER TABLE public.course_import_jobs
      ADD CONSTRAINT course_import_jobs_sync_status_chk
      CHECK (sync_status IN ('idle', 'running', 'ok', 'partial', 'failed', 'skipped'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_course_import_jobs_batch_id ON public.course_import_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_course_import_jobs_status ON public.course_import_jobs(sync_status);
CREATE INDEX IF NOT EXISTS idx_course_import_jobs_started_at ON public.course_import_jobs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_import_jobs_target_api_id ON public.course_import_jobs(target_api_id);

DROP TRIGGER IF EXISTS trg_course_import_jobs_updated ON public.course_import_jobs;
CREATE TRIGGER trg_course_import_jobs_updated
  BEFORE UPDATE ON public.course_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.course_manual_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  tee_id uuid REFERENCES public.course_tees(id) ON DELETE CASCADE,
  hole_number integer,
  field_name text NOT NULL,
  override_value jsonb NOT NULL,
  preserve_on_import boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  source_note text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.course_manual_overrides
  ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tee_id uuid REFERENCES public.course_tees(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS hole_number integer,
  ADD COLUMN IF NOT EXISTS field_name text,
  ADD COLUMN IF NOT EXISTS override_value jsonb,
  ADD COLUMN IF NOT EXISTS preserve_on_import boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_note text,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.course_manual_overrides SET preserve_on_import = true WHERE preserve_on_import IS NULL;
UPDATE public.course_manual_overrides SET is_active = true WHERE is_active IS NULL;

ALTER TABLE public.course_manual_overrides
  ALTER COLUMN preserve_on_import SET DEFAULT true,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.course_manual_overrides
  ALTER COLUMN course_id SET NOT NULL,
  ALTER COLUMN field_name SET NOT NULL,
  ALTER COLUMN override_value SET NOT NULL,
  ALTER COLUMN preserve_on_import SET NOT NULL,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_course_manual_overrides_course_id
  ON public.course_manual_overrides(course_id);
CREATE INDEX IF NOT EXISTS idx_course_manual_overrides_active
  ON public.course_manual_overrides(course_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_manual_overrides_scope_field_active
  ON public.course_manual_overrides(
    course_id,
    COALESCE(tee_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(hole_number, -1),
    field_name
  )
  WHERE is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'course_manual_overrides_hole_range_chk'
  ) THEN
    ALTER TABLE public.course_manual_overrides
      ADD CONSTRAINT course_manual_overrides_hole_range_chk
      CHECK (hole_number IS NULL OR (hole_number >= 1 AND hole_number <= 27));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_course_manual_overrides_updated ON public.course_manual_overrides;
CREATE TRIGGER trg_course_manual_overrides_updated
  BEFORE UPDATE ON public.course_manual_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.course_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_manual_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_import_jobs_select_authenticated ON public.course_import_jobs;
CREATE POLICY course_import_jobs_select_authenticated ON public.course_import_jobs
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS course_import_jobs_insert_authenticated ON public.course_import_jobs;
CREATE POLICY course_import_jobs_insert_authenticated ON public.course_import_jobs
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS course_import_jobs_update_authenticated ON public.course_import_jobs;
CREATE POLICY course_import_jobs_update_authenticated ON public.course_import_jobs
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS course_manual_overrides_select_authenticated ON public.course_manual_overrides;
CREATE POLICY course_manual_overrides_select_authenticated ON public.course_manual_overrides
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS course_manual_overrides_insert_authenticated ON public.course_manual_overrides;
CREATE POLICY course_manual_overrides_insert_authenticated ON public.course_manual_overrides
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS course_manual_overrides_update_authenticated ON public.course_manual_overrides;
CREATE POLICY course_manual_overrides_update_authenticated ON public.course_manual_overrides
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS course_manual_overrides_delete_authenticated ON public.course_manual_overrides;
CREATE POLICY course_manual_overrides_delete_authenticated ON public.course_manual_overrides
  FOR DELETE TO authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
