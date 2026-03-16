-- 068_representing_society_id.sql
-- Dual-members / multi-society: explicit representing_society_id for event players.
-- OOM and society leaderboards use representing_society_id, not member default.

-- 1. Add representing_society_id to tee_group_players (explicit; society_id kept for backward compat)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tee_group_players' AND column_name = 'representing_society_id') THEN
    ALTER TABLE public.tee_group_players ADD COLUMN representing_society_id uuid REFERENCES public.societies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill from society_id
UPDATE public.tee_group_players
SET representing_society_id = society_id
WHERE representing_society_id IS NULL AND society_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tee_group_players_representing ON public.tee_group_players(representing_society_id) WHERE representing_society_id IS NOT NULL;

COMMENT ON COLUMN public.tee_group_players.representing_society_id IS 'Society the player represents for this event (multi-society). Must be in event_societies.';
COMMENT ON COLUMN public.tee_group_players.society_id IS 'Deprecated: use representing_society_id. Kept for backward compat.';

-- 2. event_results.society_id is already the representing society for OOM - add comment
COMMENT ON COLUMN public.event_results.society_id IS 'Society the player represented for this event (OOM allocation).';
