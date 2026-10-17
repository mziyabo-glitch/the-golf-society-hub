ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS validation_basis text NOT NULL DEFAULT 'secondary_only';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_validation_basis_chk'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_validation_basis_chk
      CHECK (validation_basis IN ('official_only', 'official_plus_secondary', 'dual_secondary_match', 'secondary_only'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_validation_basis
  ON public.courses(validation_basis);
