-- Ensure golfer_data_status exists on public.courses (idempotent with 129) and backfill from
-- validation_basis / data_confidence when those columns are present.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS golfer_data_status text;

UPDATE public.courses
SET golfer_data_status = 'unverified'
WHERE golfer_data_status IS NULL
   OR btrim(golfer_data_status) = ''
   OR lower(btrim(golfer_data_status)) NOT IN ('verified', 'partial', 'unverified', 'rejected');

ALTER TABLE public.courses
  ALTER COLUMN golfer_data_status SET DEFAULT 'unverified';

ALTER TABLE public.courses
  ALTER COLUMN golfer_data_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_golfer_data_status_chk'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_golfer_data_status_chk
      CHECK (golfer_data_status IN ('verified', 'partial', 'unverified', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_golfer_data_status
  ON public.courses(golfer_data_status);

-- Verified where official-only validation (migration 130) — separate DO so we never reference missing columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'validation_basis'
  ) THEN
    UPDATE public.courses c
    SET golfer_data_status = 'verified'
    WHERE c.golfer_data_status IS DISTINCT FROM 'rejected'
      AND c.validation_basis = 'official_only';
  END IF;
END $$;

-- Verified where high data confidence (migration 128).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'data_confidence'
  ) THEN
    UPDATE public.courses c
    SET golfer_data_status = 'verified'
    WHERE c.golfer_data_status IS DISTINCT FROM 'rejected'
      AND c.data_confidence = 'high';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
