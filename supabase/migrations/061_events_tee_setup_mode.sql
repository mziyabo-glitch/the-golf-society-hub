-- Add tee_setup_mode to events for save/reload persistence
-- Values: 'single' | 'separate' | null (null = infer from tee_name/ladies_tee_name)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'tee_setup_mode'
  ) THEN
    ALTER TABLE public.events ADD COLUMN tee_setup_mode text;
    COMMENT ON COLUMN public.events.tee_setup_mode IS 'Tee setup mode: single (one tee for all) or separate (male/female tees)';
  END IF;
END $$;
