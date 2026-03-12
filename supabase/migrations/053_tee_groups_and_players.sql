-- 053_tee_groups_and_players.sql
-- Persist tee sheet: groups and player assignments.
-- Replaces reliance on events.player_ids for tee sheet order.

-- tee_groups: one row per group, stores tee time
CREATE TABLE IF NOT EXISTS public.tee_groups (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  group_number integer     NOT NULL,
  tee_time     time,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, group_number)
);

CREATE INDEX IF NOT EXISTS idx_tee_groups_event ON public.tee_groups (event_id);

-- tee_group_players: player assignment to group and position
-- player_id: member uuid, or 'guest-{event_guests.id}' for guests
CREATE TABLE IF NOT EXISTS public.tee_group_players (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  group_number integer     NOT NULL,
  position     integer     NOT NULL DEFAULT 0,
  player_id    text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_tee_group_players_event ON public.tee_group_players (event_id);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_tee_groups_updated_at ON public.tee_groups;
CREATE TRIGGER trg_tee_groups_updated_at
  BEFORE UPDATE ON public.tee_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tee_group_players_updated_at ON public.tee_group_players;
CREATE TRIGGER trg_tee_group_players_updated_at
  BEFORE UPDATE ON public.tee_group_players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: same as events (society members)
ALTER TABLE public.tee_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tee_group_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tee_groups_select ON public.tee_groups;
DROP POLICY IF EXISTS tee_groups_insert ON public.tee_groups;
DROP POLICY IF EXISTS tee_groups_update ON public.tee_groups;
DROP POLICY IF EXISTS tee_groups_delete ON public.tee_groups;

CREATE POLICY tee_groups_select ON public.tee_groups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids())));

CREATE POLICY tee_groups_insert ON public.tee_groups FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()) AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])));

CREATE POLICY tee_groups_update ON public.tee_groups FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()) AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])));

CREATE POLICY tee_groups_delete ON public.tee_groups FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()) AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])));

DROP POLICY IF EXISTS tee_group_players_select ON public.tee_group_players;
DROP POLICY IF EXISTS tee_group_players_insert ON public.tee_group_players;
DROP POLICY IF EXISTS tee_group_players_update ON public.tee_group_players;
DROP POLICY IF EXISTS tee_group_players_delete ON public.tee_group_players;

CREATE POLICY tee_group_players_select ON public.tee_group_players FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids())));

CREATE POLICY tee_group_players_insert ON public.tee_group_players FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()) AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])));

CREATE POLICY tee_group_players_update ON public.tee_group_players FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()) AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])));

CREATE POLICY tee_group_players_delete ON public.tee_group_players FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()) AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])));
