-- Decoupled background sync: enqueue on live API fetch, process async.
-- UI never blocks on DB; sync grows local library in background.

CREATE TABLE IF NOT EXISTS public.course_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_id bigint NOT NULL,
  course_name text,
  local_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  job_type text NOT NULL CHECK (job_type IN ('sync_course', 'sync_tees', 'sync_holes')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  payload jsonb,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_sync_jobs_status
  ON public.course_sync_jobs(status)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_course_sync_jobs_api_id
  ON public.course_sync_jobs(api_id);

CREATE INDEX IF NOT EXISTS idx_course_sync_jobs_created_at
  ON public.course_sync_jobs(created_at);

-- Prevent duplicate pending sync_course for same api_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_sync_jobs_pending_api_unique
  ON public.course_sync_jobs(api_id)
  WHERE status = 'pending' AND job_type = 'sync_course';

COMMENT ON TABLE public.course_sync_jobs IS 'Background sync: enqueue on live API fetch, process async to grow course library';

ALTER TABLE public.course_sync_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_sync_jobs' AND policyname = 'course_sync_jobs_insert_authenticated') THEN
    CREATE POLICY course_sync_jobs_insert_authenticated
      ON public.course_sync_jobs FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_sync_jobs' AND policyname = 'course_sync_jobs_insert_anon') THEN
    CREATE POLICY course_sync_jobs_insert_anon
      ON public.course_sync_jobs FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_sync_jobs' AND policyname = 'course_sync_jobs_all_service') THEN
    CREATE POLICY course_sync_jobs_all_service
      ON public.course_sync_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
