-- GolfCourseAPI import support:
-- - Extend courses for api_id + metadata
-- - Create course_tees and course_holes for live scoring

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'courses'
  ) THEN
    ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS club_name text;
    ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS api_id bigint;
    ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS lat double precision;
    ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS lng double precision;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_api_id_unique
      ON public.courses (api_id)
      WHERE api_id IS NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.course_tees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  tee_name text NOT NULL,
  course_rating numeric,
  slope_rating integer,
  par_total integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id, tee_name)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'course_tees'
  ) THEN
    ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS par_total integer;
    ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_course_tees_course_id
  ON public.course_tees(course_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_tees_course_name_unique
  ON public.course_tees(course_id, tee_name);

CREATE TABLE IF NOT EXISTS public.course_holes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  tee_id uuid NOT NULL REFERENCES public.course_tees(id) ON DELETE CASCADE,
  hole_number integer NOT NULL,
  par integer,
  yardage integer,
  stroke_index integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tee_id, hole_number)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'course_holes'
  ) THEN
    ALTER TABLE public.course_holes ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;
    ALTER TABLE public.course_holes ADD COLUMN IF NOT EXISTS tee_id uuid REFERENCES public.course_tees(id) ON DELETE CASCADE;
    ALTER TABLE public.course_holes ADD COLUMN IF NOT EXISTS hole_number integer;
    ALTER TABLE public.course_holes ADD COLUMN IF NOT EXISTS par integer;
    ALTER TABLE public.course_holes ADD COLUMN IF NOT EXISTS yardage integer;
    ALTER TABLE public.course_holes ADD COLUMN IF NOT EXISTS stroke_index integer;
    ALTER TABLE public.course_holes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_course_holes_course_id
  ON public.course_holes(course_id);

CREATE INDEX IF NOT EXISTS idx_course_holes_tee_id
  ON public.course_holes(tee_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_holes_tee_hole_unique
  ON public.course_holes(tee_id, hole_number);

ALTER TABLE public.course_tees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_holes ENABLE ROW LEVEL SECURITY;

-- Courses RLS (read/write for authenticated app users importing courses)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'courses'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'courses'
        AND policyname = 'courses_insert_authenticated'
    ) THEN
      CREATE POLICY courses_insert_authenticated
        ON public.courses
        FOR INSERT
        TO authenticated
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'courses'
        AND policyname = 'courses_update_authenticated'
    ) THEN
      CREATE POLICY courses_update_authenticated
        ON public.courses
        FOR UPDATE
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- course_tees policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'course_tees'
      AND policyname = 'course_tees_select_authenticated'
  ) THEN
    CREATE POLICY course_tees_select_authenticated
      ON public.course_tees
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'course_tees'
      AND policyname = 'course_tees_insert_authenticated'
  ) THEN
    CREATE POLICY course_tees_insert_authenticated
      ON public.course_tees
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'course_tees'
      AND policyname = 'course_tees_update_authenticated'
  ) THEN
    CREATE POLICY course_tees_update_authenticated
      ON public.course_tees
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- course_holes policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'course_holes'
      AND policyname = 'course_holes_select_authenticated'
  ) THEN
    CREATE POLICY course_holes_select_authenticated
      ON public.course_holes
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'course_holes'
      AND policyname = 'course_holes_insert_authenticated'
  ) THEN
    CREATE POLICY course_holes_insert_authenticated
      ON public.course_holes
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'course_holes'
      AND policyname = 'course_holes_update_authenticated'
  ) THEN
    CREATE POLICY course_holes_update_authenticated
      ON public.course_holes
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
