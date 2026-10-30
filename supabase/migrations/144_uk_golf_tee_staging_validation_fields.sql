-- 144: Add validation metadata fields to UK tee staging candidates.

ALTER TABLE public.uk_golf_api_tee_candidates
  ADD COLUMN IF NOT EXISTS validation_summary jsonb NULL;

ALTER TABLE public.uk_golf_api_tee_candidates
  ADD COLUMN IF NOT EXISTS raw_json_checksum text NULL;
