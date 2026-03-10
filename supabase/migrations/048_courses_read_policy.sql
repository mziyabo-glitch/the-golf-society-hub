DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'courses'
  ) THEN
    EXECUTE 'ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'courses'
        AND policyname = 'courses_select_authenticated'
    ) THEN
      EXECUTE '
        CREATE POLICY courses_select_authenticated
        ON public.courses
        FOR SELECT
        TO authenticated
        USING (true)
      ';
    END IF;
  END IF;
END $$;
