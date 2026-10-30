-- 162: renamed from 161_* (161_events_nullable_slope_rating already uses version 161).
-- Allow any member linked to the event (host or joint participant) to read guest rows for that event.
-- Fixes tee sheet / canonical hydration when guests belong to another participating society.

DROP POLICY IF EXISTS event_guests_select ON public.event_guests;

CREATE POLICY event_guests_select
  ON public.event_guests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.user_id = auth.uid() AND m.society_id = event_guests.society_id
    )
    OR public.current_user_linked_to_event(event_id)
  );

COMMENT ON POLICY event_guests_select ON public.event_guests IS
  'Society members see their society''s guests; anyone linked to the event sees all guests (tee sheet, joint events).';
