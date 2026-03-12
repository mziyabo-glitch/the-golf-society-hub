-- 051_events_update_handicapper.sql
-- Allow Handicapper to create and update events (matches RBAC canCreateEvents/canEditEvents).
-- Previously only Captain and Secretary could create/update; Handicapper was blocked by RLS.

DROP POLICY IF EXISTS events_insert_captain_secretary ON public.events;
DROP POLICY IF EXISTS events_update_captain_secretary ON public.events;

CREATE POLICY events_insert_captain_secretary_handicapper
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain', 'secretary', 'handicapper'])
  );

CREATE POLICY events_update_captain_secretary_handicapper
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain', 'secretary', 'handicapper'])
  );
