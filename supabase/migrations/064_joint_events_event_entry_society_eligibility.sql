-- =====================================================
-- PHASE 1 JOINT EVENTS: event_entry_society_eligibility
-- =====================================================
-- Per-society eligibility for each event entry.
-- Determines whether a player counts for that society's
-- results and/or OOM in joint events.
--
-- NOTE: Depends on event_entries (063).
-- ROLLBACK: DROP TABLE IF EXISTS public.event_entry_society_eligibility CASCADE;
-- =====================================================

CREATE TABLE IF NOT EXISTS public.event_entry_society_eligibility (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_entry_id                  uuid        NOT NULL REFERENCES public.event_entries(id) ON DELETE CASCADE,
  society_id                      uuid        NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  is_eligible_for_society_results boolean     NOT NULL DEFAULT true,
  is_eligible_for_society_oom     boolean     NOT NULL DEFAULT true,
  manual_override_reason          text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_entry_id, society_id)
);

CREATE INDEX IF NOT EXISTS idx_event_entry_eligibility_entry
  ON public.event_entry_society_eligibility(event_entry_id);
CREATE INDEX IF NOT EXISTS idx_event_entry_eligibility_society
  ON public.event_entry_society_eligibility(society_id);

COMMENT ON TABLE public.event_entry_society_eligibility IS
  'Per-society eligibility for event entries in joint events. Dual-members: control which society they count for.';
COMMENT ON COLUMN public.event_entry_society_eligibility.manual_override_reason IS
  'Optional reason when eligibility is manually overridden (e.g. guest, wrong society).';

ALTER TABLE public.event_entry_society_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_entry_eligibility_select
  ON public.event_entry_society_eligibility FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_entries ee
      JOIN public.events e ON e.id = ee.event_id
      WHERE ee.id = event_entry_id
        AND (e.society_id IN (SELECT public.my_society_ids())
             OR EXISTS (
               SELECT 1 FROM public.event_societies es
               WHERE es.event_id = e.id
                 AND es.society_id IN (SELECT public.my_society_ids())
             ))
    )
  );

CREATE POLICY event_entry_eligibility_insert
  ON public.event_entry_society_eligibility FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_entries ee
      JOIN public.events e ON e.id = ee.event_id
      WHERE ee.id = event_entry_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

CREATE POLICY event_entry_eligibility_update
  ON public.event_entry_society_eligibility FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_entries ee
      JOIN public.events e ON e.id = ee.event_id
      WHERE ee.id = event_entry_society_eligibility.event_entry_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );

CREATE POLICY event_entry_eligibility_delete
  ON public.event_entry_society_eligibility FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_entries ee
      JOIN public.events e ON e.id = ee.event_id
      WHERE ee.id = event_entry_society_eligibility.event_entry_id
        AND e.society_id IN (SELECT public.my_society_ids())
        AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
    )
  );
