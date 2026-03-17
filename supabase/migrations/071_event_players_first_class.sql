-- 071_event_players_first_class.sql
-- Joint events first-class: event_players as canonical player selection.
-- Single-society = 1 event + 1 event_societies row.
-- Joint = 1 event + multiple event_societies rows.
-- Players always in event_players (members + guests).

-- 1. Create event_players table
CREATE TABLE IF NOT EXISTS public.event_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  event_guest_id uuid REFERENCES public.event_guests(id) ON DELETE CASCADE,
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_players_chk_one_player CHECK (
    (member_id IS NOT NULL AND event_guest_id IS NULL) OR
    (member_id IS NULL AND event_guest_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_players_member
  ON public.event_players (event_id, member_id) WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_players_guest
  ON public.event_players (event_id, event_guest_id) WHERE event_guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_players_event ON public.event_players (event_id);
CREATE INDEX IF NOT EXISTS idx_event_players_society ON public.event_players (society_id);

COMMENT ON TABLE public.event_players IS 'Selected players for an event (members + guests). Single source of truth for player selection.';

-- 2. Backfill from events.player_ids (member IDs)
INSERT INTO public.event_players (event_id, member_id, society_id, position)
SELECT e.id, m.id, m.society_id, t.ord - 1
FROM public.events e
CROSS JOIN LATERAL unnest(e.player_ids) WITH ORDINALITY AS t(mid, ord)
JOIN public.members m ON m.id = t.mid::uuid
WHERE e.player_ids IS NOT NULL AND array_length(e.player_ids, 1) > 0
  AND NOT EXISTS (SELECT 1 FROM public.event_players ep WHERE ep.event_id = e.id AND ep.member_id = m.id);

-- 3. Backfill from event_guests (all guests are selected by default)

INSERT INTO public.event_players (event_id, event_guest_id, society_id, position)
SELECT eg.event_id, eg.id, eg.society_id, 1000 + row_number() OVER (PARTITION BY eg.event_id ORDER BY eg.created_at) - 1
FROM public.event_guests eg
WHERE NOT EXISTS (SELECT 1 FROM public.event_players ep WHERE ep.event_id = eg.event_id AND ep.event_guest_id = eg.id);

-- 4. RLS for event_players
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

-- Insert/update/delete: user must be in a participating society with admin role
DROP POLICY IF EXISTS event_players_insert ON public.event_players;
CREATE POLICY event_players_insert ON public.event_players FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.society_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.society_id IN (SELECT public.event_participating_society_ids(event_id))
        AND public.has_role_in_society(sm.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

DROP POLICY IF EXISTS event_players_update ON public.event_players;
CREATE POLICY event_players_update ON public.event_players FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.society_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.society_id IN (SELECT public.event_participating_society_ids(event_id))
        AND public.has_role_in_society(sm.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.society_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.society_id IN (SELECT public.event_participating_society_ids(event_id))
        AND public.has_role_in_society(sm.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

DROP POLICY IF EXISTS event_players_delete ON public.event_players;
CREATE POLICY event_players_delete ON public.event_players FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.society_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.society_id IN (SELECT public.event_participating_society_ids(event_id))
        AND public.has_role_in_society(sm.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

-- 5. Ensure event_societies has host for single-society events (backfill)

INSERT INTO public.event_societies (event_id, society_id)
SELECT e.id, COALESCE(e.host_society_id, e.society_id)
FROM public.events e
WHERE NOT EXISTS (SELECT 1 FROM public.event_societies es WHERE es.event_id = e.id)
  AND (e.host_society_id IS NOT NULL OR e.society_id IS NOT NULL)
ON CONFLICT (event_id, society_id) DO NOTHING;
