-- 067_multi_society_events.sql
-- Level 2 Multi-Society Event Mode: one event, multiple participating societies.

-- 1. Add host_society_id to events (alias for society_id; keep society_id for backward compat)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'host_society_id') THEN
    ALTER TABLE public.events ADD COLUMN host_society_id uuid REFERENCES public.societies(id) ON DELETE CASCADE;
    UPDATE public.events SET host_society_id = society_id WHERE host_society_id IS NULL;
  END IF;
END $$;

-- 2. Add is_multi_society to events
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'is_multi_society') THEN
    ALTER TABLE public.events ADD COLUMN is_multi_society boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Backfill host_society_id from society_id for any remaining nulls
UPDATE public.events SET host_society_id = society_id WHERE host_society_id IS NULL;

-- 3. Create event_societies join table
CREATE TABLE IF NOT EXISTS public.event_societies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, society_id)
);

CREATE INDEX IF NOT EXISTS idx_event_societies_event ON public.event_societies(event_id);
CREATE INDEX IF NOT EXISTS idx_event_societies_society ON public.event_societies(society_id);

COMMENT ON TABLE public.event_societies IS 'Participating societies for multi-society events; includes host society';

-- Backfill event_societies for existing single-society events (one row per event)
INSERT INTO public.event_societies (event_id, society_id)
SELECT e.id, e.society_id
FROM public.events e
WHERE NOT EXISTS (SELECT 1 FROM public.event_societies es WHERE es.event_id = e.id AND es.society_id = e.society_id)
ON CONFLICT (event_id, society_id) DO NOTHING;

-- 4. Add society_id to tee_group_players
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tee_group_players' AND column_name = 'society_id') THEN
    ALTER TABLE public.tee_group_players ADD COLUMN society_id uuid REFERENCES public.societies(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tee_group_players_society ON public.tee_group_players(society_id) WHERE society_id IS NOT NULL;

-- Backfill tee_group_players.society_id from members (for member players)
UPDATE public.tee_group_players tgp
SET society_id = m.society_id
FROM public.members m
WHERE tgp.player_id = m.id::text
  AND tgp.society_id IS NULL;

-- Backfill from event_guests (for guest players: player_id = 'guest-{event_guests.id}')
UPDATE public.tee_group_players tgp
SET society_id = eg.society_id
FROM public.event_guests eg
WHERE tgp.player_id = 'guest-' || eg.id::text
  AND tgp.society_id IS NULL;

-- Backfill from event host society for any remaining (single-society fallback)
UPDATE public.tee_group_players tgp
SET society_id = e.society_id
FROM public.events e
WHERE tgp.event_id = e.id
  AND tgp.society_id IS NULL;

-- 5. RLS for event_societies
ALTER TABLE public.event_societies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_societies_select ON public.event_societies;
CREATE POLICY event_societies_select ON public.event_societies FOR SELECT TO authenticated
  USING (society_id IN (SELECT public.my_society_ids()));

DROP POLICY IF EXISTS event_societies_insert ON public.event_societies;
CREATE POLICY event_societies_insert ON public.event_societies FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()) AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper']))
  );

DROP POLICY IF EXISTS event_societies_delete ON public.event_societies;
CREATE POLICY event_societies_delete ON public.event_societies FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()) AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper']))
  );

-- 6. Extend events RLS so users in any participating society can see the event
DROP POLICY IF EXISTS events_select_society ON public.events;
DROP POLICY IF EXISTS events_select_in_society ON public.events;
CREATE POLICY events_select_society ON public.events FOR SELECT TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    OR EXISTS (SELECT 1 FROM public.event_societies es WHERE es.event_id = events.id AND es.society_id IN (SELECT public.my_society_ids()))
  );

-- 7. Extend tee_groups and tee_group_players RLS for multi-society (user in any participating society can access)
DROP POLICY IF EXISTS tee_groups_select ON public.tee_groups;
CREATE POLICY tee_groups_select ON public.tee_groups FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.society_id IN (SELECT public.my_society_ids()) OR EXISTS (SELECT 1 FROM public.event_societies es WHERE es.event_id = e.id AND es.society_id IN (SELECT public.my_society_ids()))))
  );

DROP POLICY IF EXISTS tee_group_players_select ON public.tee_group_players;
CREATE POLICY tee_group_players_select ON public.tee_group_players FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.society_id IN (SELECT public.my_society_ids()) OR EXISTS (SELECT 1 FROM public.event_societies es WHERE es.event_id = e.id AND es.society_id IN (SELECT public.my_society_ids()))))
  );

-- Insert/update/delete for tee_groups/tee_group_players: only host society admins (keep existing logic for now)
