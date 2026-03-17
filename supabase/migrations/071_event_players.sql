-- 071_event_players.sql
-- event_players: selected members + guests for an event.
-- Replaces events.player_ids as the canonical source for event participants.
-- event_guests remains for guest definitions; event_players references them for guest players.
-- RLS: authorize through society_members (members table), not event_societies self-reference.

-- 1. Create event_players table
CREATE TABLE IF NOT EXISTS public.event_players (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id         uuid        REFERENCES public.members(id) ON DELETE CASCADE,
  event_guest_id    uuid        REFERENCES public.event_guests(id) ON DELETE CASCADE,
  position          integer     NOT NULL DEFAULT 0,
  representing_society_id uuid  REFERENCES public.societies(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_players_member_or_guest CHECK (
    (member_id IS NOT NULL AND event_guest_id IS NULL) OR
    (member_id IS NULL AND event_guest_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_players_unique_member ON public.event_players (event_id, member_id) WHERE (member_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS event_players_unique_guest ON public.event_players (event_id, event_guest_id) WHERE (event_guest_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_event_players_event ON public.event_players(event_id);
CREATE INDEX IF NOT EXISTS idx_event_players_member ON public.event_players(member_id) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_players_guest ON public.event_players(event_guest_id) WHERE event_guest_id IS NOT NULL;

COMMENT ON TABLE public.event_players IS 'Selected members and guests for an event. Replaces events.player_ids.';

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_event_players_updated_at ON public.event_players;
CREATE TRIGGER trg_event_players_updated_at
  BEFORE UPDATE ON public.event_players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Backfill from events.player_ids (member IDs only)
DO $$
DECLARE
  ev RECORD;
  arr uuid[];
  j int;
BEGIN
  FOR ev IN SELECT id, player_ids FROM public.events WHERE player_ids IS NOT NULL AND array_length(player_ids, 1) > 0
  LOOP
    arr := ev.player_ids;
    FOR j IN 1..array_length(arr, 1)
    LOOP
      INSERT INTO public.event_players (event_id, member_id, position)
      VALUES (ev.id, arr[j], j - 1)
      ON CONFLICT (event_id, member_id) WHERE member_id IS NOT NULL DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- 3. Backfill guests: each event_guest gets an event_players row (guests are selected when added)
INSERT INTO public.event_players (event_id, event_guest_id, position)
SELECT eg.event_id, eg.id, 1000 + row_number() OVER (PARTITION BY eg.event_id ORDER BY eg.created_at)::integer
FROM public.event_guests eg
WHERE NOT EXISTS (SELECT 1 FROM public.event_players ep WHERE ep.event_id = eg.event_id AND ep.event_guest_id = eg.id);

-- 4. RLS: authorize through society_members, using event_participating_society_ids
ALTER TABLE public.event_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_players_select ON public.event_players;
CREATE POLICY event_players_select ON public.event_players FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.society_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.society_id IN (SELECT public.event_participating_society_ids(event_players.event_id))
    )
  );

DROP POLICY IF EXISTS event_players_insert ON public.event_players;
CREATE POLICY event_players_insert ON public.event_players FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.society_members sm ON sm.society_id = e.society_id AND sm.user_id = auth.uid()
      WHERE e.id = event_id
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

DROP POLICY IF EXISTS event_players_update ON public.event_players;
CREATE POLICY event_players_update ON public.event_players FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.society_members sm ON sm.society_id = e.society_id AND sm.user_id = auth.uid()
      WHERE e.id = event_id
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.society_members sm ON sm.society_id = e.society_id AND sm.user_id = auth.uid()
      WHERE e.id = event_id
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

DROP POLICY IF EXISTS event_players_delete ON public.event_players;
CREATE POLICY event_players_delete ON public.event_players FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.society_members sm ON sm.society_id = e.society_id AND sm.user_id = auth.uid()
      WHERE e.id = event_id
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );
