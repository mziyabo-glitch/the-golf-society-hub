-- =====================================================
-- PHASE 1 JOINT EVENTS: event_entries
-- =====================================================
-- Unified tee-sheet entries for events (members only in Phase 1).
-- One row per player per event — dual-members appear once.
-- pairing_group/position for tee sheet ordering.
--
-- NOTE: Does NOT modify existing events, event_registrations, or tee_group_players.
-- Single-society flow remains unchanged. This table is for joint-event flow.
-- ROLLBACK: DROP TABLE IF EXISTS public.event_entry_society_eligibility CASCADE;
--           DROP TABLE IF EXISTS public.event_entries CASCADE;
-- =====================================================

CREATE TABLE IF NOT EXISTS public.event_entries (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_id         uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  tee_id            uuid        REFERENCES public.course_tees(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'withdrawn', 'no_show')),
  pairing_group     integer,
  pairing_position  integer,
  is_scoring        boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_event_entries_event_id
  ON public.event_entries(event_id);
CREATE INDEX IF NOT EXISTS idx_event_entries_player_id
  ON public.event_entries(player_id);
CREATE INDEX IF NOT EXISTS idx_event_entries_tee_id
  ON public.event_entries(tee_id) WHERE tee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_entries_pairing
  ON public.event_entries(event_id, pairing_group, pairing_position)
  WHERE pairing_group IS NOT NULL;

COMMENT ON TABLE public.event_entries IS
  'Tee sheet entries for joint events. One row per player per event. Dual-members appear once.';
COMMENT ON COLUMN public.event_entries.player_id IS
  'References members.id — the member playing in this event';
COMMENT ON COLUMN public.event_entries.tee_id IS
  'Optional: which tee set (course_tees) this player uses. Falls back to event.tee_id if null.';
COMMENT ON COLUMN public.event_entries.pairing_group IS
  'Tee group number (e.g. 1, 2, 3). Null until tee sheet published.';
COMMENT ON COLUMN public.event_entries.pairing_position IS
  'Position within the group (1-4). Null until tee sheet published.';
COMMENT ON COLUMN public.event_entries.is_scoring IS
  'True if this player is designated to submit scores for the group';

ALTER TABLE public.event_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_entries_select
  ON public.event_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (e.society_id IN (SELECT public.my_society_ids())
             OR EXISTS (
               SELECT 1 FROM public.event_societies es
               WHERE es.event_id = e.id
                 AND es.society_id IN (SELECT public.my_society_ids())
             ))
    )
  );

CREATE POLICY event_entries_insert
  ON public.event_entries FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

CREATE POLICY event_entries_update
  ON public.event_entries FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_entries.event_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

CREATE POLICY event_entries_delete
  ON public.event_entries FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_entries.event_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );
