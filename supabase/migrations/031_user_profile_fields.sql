-- 031: Add personal profile fields to profiles table
-- full_name, sex, email, whs_index, profile_complete
-- RLS already in place from 002 (select/insert/update own row)

-- Add new columns (safe: IF NOT EXISTS via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name') THEN
    ALTER TABLE public.profiles ADD COLUMN full_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'sex') THEN
    ALTER TABLE public.profiles ADD COLUMN sex text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email') THEN
    ALTER TABLE public.profiles ADD COLUMN email text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'whs_index') THEN
    ALTER TABLE public.profiles ADD COLUMN whs_index numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'profile_complete') THEN
    ALTER TABLE public.profiles ADD COLUMN profile_complete boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add a check constraint for sex values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'profiles_sex_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_sex_check CHECK (sex IN ('Male', 'Female'));
  END IF;
END $$;
