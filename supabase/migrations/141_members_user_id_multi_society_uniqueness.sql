-- 141: Ensure members.user_id uniqueness is scoped per society (multi-society safe).
--
-- Problem:
-- Some environments still carry a legacy UNIQUE(user_id) constraint/index on public.members.
-- That blocks a user from joining a second society (e.g. M4 -> ZGS), even though product
-- behavior requires one user to belong to multiple societies.
--
-- Fix:
-- - Drop any single-column unique constraint/index on members.user_id.
-- - Enforce uniqueness only for (society_id, user_id) when user_id is not null.
--
-- Idempotent and safe to run repeatedly.

DO $$
DECLARE
  r record;
BEGIN
  -- Drop table-level unique constraints that are exactly (user_id).
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'members'
      AND c.contype = 'u'
      AND c.conkey = ARRAY[
        (SELECT attnum
         FROM pg_attribute
         WHERE attrelid = t.oid
           AND attname = 'user_id')
      ]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.members DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  -- Drop standalone unique indexes that are exactly (user_id) and not backing constraints.
  FOR r IN
    SELECT i.relname AS index_name
    FROM pg_index x
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class i ON i.oid = x.indexrelid
    LEFT JOIN pg_constraint c ON c.conindid = x.indexrelid
    WHERE n.nspname = 'public'
      AND t.relname = 'members'
      AND x.indisunique = true
      AND c.oid IS NULL
      AND x.indnatts = 1
      AND x.indkey[0] = (
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = t.oid
          AND attname = 'user_id'
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.index_name);
  END LOOP;
END
$$;

-- Allow one linked member row per user per society (but across many societies).
CREATE UNIQUE INDEX IF NOT EXISTS members_society_user_unique
  ON public.members(society_id, user_id)
  WHERE user_id IS NOT NULL;
