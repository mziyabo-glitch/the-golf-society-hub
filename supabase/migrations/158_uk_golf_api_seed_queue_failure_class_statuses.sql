-- Expand uk_golf_api_seed_queue.status to classified failure values (see lib/server/ukGolfApiSeedQueueStatus.ts).

ALTER TABLE public.uk_golf_api_seed_queue DROP CONSTRAINT IF EXISTS uk_golf_api_seed_queue_status_check;

ALTER TABLE public.uk_golf_api_seed_queue
  ADD CONSTRAINT uk_golf_api_seed_queue_status_check CHECK (
    status = ANY (
      ARRAY[
        'pending',
        'processing',
        'staged',
        'partial',
        'skipped',
        'rate_limited',
        'failed',
        'missing_scorecard',
        'missing_tees',
        'invalid_si',
        'invalid_pars',
        'api_timeout',
        'incomplete_holes',
        'duplicate_course',
        'invalid_ratings'
      ]::text[]
    )
  );
