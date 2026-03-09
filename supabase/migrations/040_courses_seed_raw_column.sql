-- 040_courses_seed_raw_column.sql
-- Add `raw` alias column for importer/API compatibility.

ALTER TABLE public.courses_seed
  ADD COLUMN IF NOT EXISTS raw jsonb;

UPDATE public.courses_seed
SET raw = raw_row
WHERE raw IS NULL;
