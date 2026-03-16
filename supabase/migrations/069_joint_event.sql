-- 069_joint_event.sql
-- Add is_joint_event for "Joint Event" terminology (alias for is_multi_society).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'is_joint_event') THEN
    ALTER TABLE public.events ADD COLUMN is_joint_event boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Backfill from is_multi_society
UPDATE public.events SET is_joint_event = is_multi_society WHERE is_joint_event = false AND is_multi_society = true;

COMMENT ON COLUMN public.events.is_joint_event IS 'Joint event with multiple participating societies. Synced with is_multi_society.';
