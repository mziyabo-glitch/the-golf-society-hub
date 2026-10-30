-- 143: Add provider_tee_set_id and uniqueness for staged UK tee candidates.

ALTER TABLE public.uk_golf_api_tee_candidates
  ADD COLUMN IF NOT EXISTS provider_tee_set_id text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_uk_golf_api_tee_candidates_course_provider_tee
  ON public.uk_golf_api_tee_candidates(course_candidate_id, provider_tee_set_id);
