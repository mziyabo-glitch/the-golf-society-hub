-- ManCo: remove a society-scoped event guest (hard delete) and strip persisted tee_group_players.

CREATE OR REPLACE FUNCTION public.remove_event_guest(
  p_event_id uuid,
  p_society_id uuid,
  p_target_guest_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_uid               uuid := auth.uid();
  v_host_society_id   uuid;
  v_event_allows      boolean;
  v_caller_id         uuid;
  v_caller_role       text;
  v_guest_society_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT e.society_id
    INTO v_host_society_id
    FROM public.events e
   WHERE e.id = p_event_id;
  IF v_host_society_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  v_event_allows :=
    p_society_id = v_host_society_id
    OR EXISTS (
      SELECT 1
        FROM public.event_societies es
       WHERE es.event_id = p_event_id
         AND es.society_id = p_society_id
    );
  IF NOT v_event_allows THEN
    RAISE EXCEPTION 'This society is not part of this event';
  END IF;

  SELECT m.id, m.role
    INTO v_caller_id, v_caller_role
    FROM public.members m
   WHERE m.user_id = v_uid
     AND m.society_id = p_society_id
   LIMIT 1;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'No membership in this society — switch the active society in the app.';
  END IF;

  IF upper(coalesce(v_caller_role, '')) NOT IN ('CAPTAIN', 'TREASURER', 'SECRETARY', 'HANDICAPPER') THEN
    RAISE EXCEPTION 'Only Captain, Treasurer, Secretary, or Handicapper can remove guests';
  END IF;

  SELECT g.society_id
    INTO v_guest_society_id
    FROM public.event_guests g
   WHERE g.id = p_target_guest_id
     AND g.event_id = p_event_id
   LIMIT 1;

  IF v_guest_society_id IS NULL THEN
    RAISE EXCEPTION 'Guest not found for this event.';
  END IF;

  IF v_guest_society_id <> p_society_id THEN
    RAISE EXCEPTION 'Guest belongs to another society — switch the active society to remove them.';
  END IF;

  DELETE FROM public.tee_group_players tgp
   WHERE tgp.event_id = p_event_id
     AND tgp.player_id = 'guest-' || p_target_guest_id::text;

  DELETE FROM public.event_guests g
   WHERE g.id = p_target_guest_id
     AND g.event_id = p_event_id
     AND g.society_id = p_society_id;
END
$f$;

COMMENT ON FUNCTION public.remove_event_guest(uuid, uuid, uuid) IS
  'ManCo: delete event_guest for (event, guest) in p_society_id; strip tee sheet guest-* player rows.';

GRANT EXECUTE ON FUNCTION public.remove_event_guest(uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
