-- Add society_onboarding_skipped to profiles for "Skip for now" in onboarding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'society_onboarding_skipped'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN society_onboarding_skipped boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN public.profiles.society_onboarding_skipped IS 'User chose Skip on society onboarding; allow personal mode without society';
  END IF;
END $$;
