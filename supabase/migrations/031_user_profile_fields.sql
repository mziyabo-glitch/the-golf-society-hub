-- 031: Ensure profiles table has user-profile columns
-- Idempotent: safe to run multiple times.
--
-- After running, reload PostgREST schema cache:
--   Supabase Dashboard → Settings → API → "Reload schema cache"

-- ─── 1. Create table if it doesn't exist ────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Add columns (safe: IF NOT EXISTS via DO block) ──────────────
DO $$
BEGIN
  -- Columns that may already exist from earlier migrations
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='active_society_id') THEN
    ALTER TABLE public.profiles ADD COLUMN active_society_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='active_member_id') THEN
    ALTER TABLE public.profiles ADD COLUMN active_member_id uuid;
  END IF;

  -- New user-profile columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='full_name') THEN
    ALTER TABLE public.profiles ADD COLUMN full_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='sex') THEN
    ALTER TABLE public.profiles ADD COLUMN sex text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='email') THEN
    ALTER TABLE public.profiles ADD COLUMN email text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='whs_index') THEN
    ALTER TABLE public.profiles ADD COLUMN whs_index numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='profile_complete') THEN
    ALTER TABLE public.profiles ADD COLUMN profile_complete boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─── 3. Constraints ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='profiles_sex_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_sex_check CHECK (sex IN ('Male', 'Female'));
  END IF;
END $$;

-- ─── 4. RLS (idempotent — DROP IF EXISTS + CREATE) ──────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ─── 5. Notify PostgREST to pick up the new columns ────────────────
NOTIFY pgrst, 'reload schema';
