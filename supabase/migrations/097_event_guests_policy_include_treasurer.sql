-- 097_event_guests_policy_include_treasurer.sql
-- Align event guest management with event manager roles used in-app.

DROP POLICY IF EXISTS event_guests_insert ON public.event_guests;
DROP POLICY IF EXISTS event_guests_update ON public.event_guests;
DROP POLICY IF EXISTS event_guests_delete ON public.event_guests;

-- Captain / Secretary / Treasurer / Handicapper can manage guests.
CREATE POLICY event_guests_insert
  ON public.event_guests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid() AND m.society_id = event_guests.society_id
      AND upper(coalesce(m.role,'')) IN ('CAPTAIN','SECRETARY','TREASURER','HANDICAPPER')
  ));

CREATE POLICY event_guests_update
  ON public.event_guests FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid() AND m.society_id = event_guests.society_id
      AND upper(coalesce(m.role,'')) IN ('CAPTAIN','SECRETARY','TREASURER','HANDICAPPER')
  ));

CREATE POLICY event_guests_delete
  ON public.event_guests FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid() AND m.society_id = event_guests.society_id
      AND upper(coalesce(m.role,'')) IN ('CAPTAIN','SECRETARY','TREASURER','HANDICAPPER')
  ));

NOTIFY pgrst, 'reload schema';
