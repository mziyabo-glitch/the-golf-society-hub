-- Add unique constraint on courses.dedupe_key for upsert support
-- Required for: upsert(payload, { onConflict: 'dedupe_key' })

-- 1. Ensure dedupe_key column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'dedupe_key'
  ) THEN
    ALTER TABLE public.courses ADD COLUMN dedupe_key text;
  END IF;
END $$;

-- 2. Backfill null/empty dedupe_key with deterministic fallback
--    api_id exists -> golfcourseapi:{api_id}
--    else -> slugify from course_name/club_name, with id suffix for uniqueness
UPDATE public.courses
SET dedupe_key = COALESCE(
  CASE
    WHEN api_id IS NOT NULL THEN 'golfcourseapi:' || api_id::text
    ELSE NULL
  END,
  'legacy:' || lower(regexp_replace(
    regexp_replace(
      coalesce(course_name, 'unknown') || '-' || coalesce(club_name, ''),
      '[^a-z0-9]+', '-', 'gi'
    ),
    '^-+|-+$', '', 'g'
  )) || ':' || id::text
)
WHERE dedupe_key IS NULL OR trim(dedupe_key) = '';

-- 3. Resolve duplicates: suffix non-first rows with id
WITH ranked AS (
  SELECT id, dedupe_key,
    row_number() OVER (PARTITION BY dedupe_key ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.courses
  WHERE dedupe_key IS NOT NULL AND trim(dedupe_key) != ''
),
duplicates AS (
  SELECT id, dedupe_key
  FROM ranked
  WHERE rn > 1
)
UPDATE public.courses c
SET dedupe_key = c.dedupe_key || ':' || c.id::text
FROM duplicates d
WHERE c.id = d.id;

-- 4. Final backfill: any remaining null gets unique fallback
UPDATE public.courses
SET dedupe_key = 'fallback:' || id::text
WHERE dedupe_key IS NULL OR trim(dedupe_key) = '';

-- 5. Add NOT NULL if column allows it (skip if already NOT NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'dedupe_key'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.courses ALTER COLUMN dedupe_key SET NOT NULL;
  END IF;
END $$;

-- 6. Add unique index
DROP INDEX IF EXISTS courses_dedupe_key_idx;
CREATE UNIQUE INDEX courses_dedupe_key_idx ON public.courses (dedupe_key);

COMMENT ON COLUMN public.courses.dedupe_key IS 'Deterministic key for upsert: golfcourseapi:{api_id} or slugified name.';
