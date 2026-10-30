CREATE TABLE IF NOT EXISTS public.uk_golf_api_seed_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  territory text NOT NULL CHECK (territory IN ('england', 'wales', 'scotland', 'ni')),
  query text NOT NULL,
  club_id text NULL,
  course_id text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'staged', 'partial', 'failed', 'rate_limited', 'skipped')),
  priority integer NOT NULL DEFAULT 100,
  attempts integer NOT NULL DEFAULT 0,
  last_attempted_at timestamptz NULL,
  next_attempt_after timestamptz NULL,
  last_error text NULL,
  staged_course_candidate_id uuid NULL REFERENCES public.uk_golf_api_course_candidates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uk_golf_api_seed_queue_territory_query_uniq
  ON public.uk_golf_api_seed_queue(territory, query);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uk_golf_api_seed_queue_course_id_uniq
  ON public.uk_golf_api_seed_queue(course_id)
  WHERE course_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_uk_golf_api_seed_queue_status_next_attempt
  ON public.uk_golf_api_seed_queue(status, next_attempt_after, priority DESC, created_at ASC);
