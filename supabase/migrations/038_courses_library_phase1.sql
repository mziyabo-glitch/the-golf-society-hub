-- 038_courses_library_phase1.sql
-- Phase 1 shared course library (Fairway Forecast -> Golf Society Hub)

-- ---------------------------------------------------------------------
-- Raw import table: preserves source rows for audit/debugging
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses_seed (
  id bigserial PRIMARY KEY,
  source text NOT NULL DEFAULT 'fairway_forecast',
  source_country_code text NOT NULL DEFAULT 'gb',
  source_key text NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  area text NOT NULL DEFAULT '',
  raw_row jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_country_code, source_key)
);

CREATE INDEX IF NOT EXISTS courses_seed_country_name_idx
  ON public.courses_seed (source_country_code, normalized_name);

CREATE INDEX IF NOT EXISTS courses_seed_imported_at_idx
  ON public.courses_seed (imported_at DESC);

-- ---------------------------------------------------------------------
-- Normalized course library used by app UIs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'fairway_forecast',
  source_country_code text NOT NULL DEFAULT 'gb',
  dedupe_key text NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  area text NOT NULL DEFAULT '',
  raw_row jsonb NOT NULL,
  seed_source_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_country_code, dedupe_key)
);

CREATE INDEX IF NOT EXISTS courses_country_name_idx
  ON public.courses (source_country_code, normalized_name);

CREATE INDEX IF NOT EXISTS courses_country_area_name_idx
  ON public.courses (source_country_code, area, normalized_name);

CREATE INDEX IF NOT EXISTS courses_area_idx
  ON public.courses (area);

-- Keep events.course_id compatible with normalized course IDs.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS course_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_course_id_fkey'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_course_id_fkey
      FOREIGN KEY (course_id)
      REFERENCES public.courses(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- RLS: app can read shared course library; writes are restricted
-- to elevated keys (service role / migrations)
-- ---------------------------------------------------------------------
ALTER TABLE public.courses_seed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courses_seed_select_authenticated ON public.courses_seed;
CREATE POLICY courses_seed_select_authenticated
  ON public.courses_seed
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS courses_select_authenticated ON public.courses;
CREATE POLICY courses_select_authenticated
  ON public.courses
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');
