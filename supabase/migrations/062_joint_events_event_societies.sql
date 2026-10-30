-- =====================================================
-- PHASE 1 JOINT EVENTS: event_societies
-- =====================================================
-- Links societies to events for joint/multi-society events.
-- Each society can have a role (host, participant) and
-- optionally contribute to its own OOM from the event.
--
-- NOTE: Does NOT modify existing events or event_registrations.
-- ROLLBACK: DROP TABLE IF EXISTS public.event_societies CASCADE;
-- =====================================================

CREATE TABLE IF NOT EXISTS public.event_societies (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  society_id        uuid        NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  role              text        NOT NULL DEFAULT 'participant' CHECK (role IN ('host', 'participant')),
  has_society_oom   boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, society_id)
);

CREATE INDEX IF NOT EXISTS idx_event_societies_event_id
  ON public.event_societies(event_id);
CREATE INDEX IF NOT EXISTS idx_event_societies_society_id
  ON public.event_societies(society_id);

COMMENT ON TABLE public.event_societies IS
  'Joint events: societies participating in an event. Host = primary organiser.';
COMMENT ON COLUMN public.event_societies.role IS
  'host = primary organising society; participant = invited society';
COMMENT ON COLUMN public.event_societies.has_society_oom IS
  'If true, this society awards OOM points from this event to its members';

ALTER TABLE public.event_societies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_societies_select ON public.event_societies;
CREATE POLICY event_societies_select
  ON public.event_societies FOR SELECT TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND e.society_id IN (SELECT public.my_society_ids())
    )
  );

DROP POLICY IF EXISTS event_societies_insert ON public.event_societies;
CREATE POLICY event_societies_insert
  ON public.event_societies FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary'])
    )
  );

DROP POLICY IF EXISTS event_societies_update ON public.event_societies;
CREATE POLICY event_societies_update
  ON public.event_societies FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_societies.event_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary'])
    )
  );

DROP POLICY IF EXISTS event_societies_delete ON public.event_societies;
CREATE POLICY event_societies_delete
  ON public.event_societies FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_societies.event_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary'])
    )
  );
