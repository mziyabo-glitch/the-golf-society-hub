ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS golfer_data_status text NOT NULL DEFAULT 'unverified';

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_import_staging_status_chk'
  ) THEN
    ALTER TABLE public.course_import_staging
      ADD CONSTRAINT course_import_staging_status_chk
      CHECK (status IN ('verified', 'partial', 'unverified', 'rejected', 'rejected_low_confidence'));
  END IF;
END $$;

