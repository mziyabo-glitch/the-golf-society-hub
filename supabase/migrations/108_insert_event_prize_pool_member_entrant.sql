-- Pot Master / ManCo: add a society member to a prize pool on behalf of someone who
-- did not opt in via the app (same permission model as insert_event_prize_pool_guest_entrant).

CREATE OR REPLACE FUNCTION public.insert_event_prize_pool_member_entrant(
  p_pool_id uuid,
  p_member_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_event_id uuid;
  v_display text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT event_id INTO v_event_id FROM public.event_prize_pools WHERE id = p_pool_id;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Prize pool not found.';
  END IF;

  IF NOT public.user_can_manage_event_prize_pools(v_event_id) THEN
    RAISE EXCEPTION 'Permission denied.';
  END IF;

  IF NOT COALESCE((SELECT prize_pool_enabled FROM public.events WHERE id = v_event_id), false) THEN
    RAISE EXCEPTION 'Prize pool is not enabled for this event.';
  END IF;

  SELECT COALESCE(NULLIF(trim(m.display_name), ''), NULLIF(trim(m.name), ''), 'Member')
  INTO v_display
  FROM public.members m
  WHERE m.id = p_member_id
    AND m.society_id IN (SELECT society_id FROM public.event_prize_pool_linked_society_ids(v_event_id));

  IF v_display IS NULL THEN
    RAISE EXCEPTION 'Member not found or not in an event-linked society.';
  END IF;

  INSERT INTO public.event_prize_pool_entries (
    event_id,
    pool_id,
    member_id,
    guest_id,
    participant_name,
    participant_type,
    opted_in,
    confirmed_by_pot_master,
    confirmed_at
  ) VALUES (
    v_event_id,
    p_pool_id,
    p_member_id,
    NULL,
    v_display,
    'member',
    true,
    false,
    NULL
  )
  ON CONFLICT (pool_id, member_id) WHERE member_id IS NOT NULL DO UPDATE SET
    participant_name = EXCLUDED.participant_name,
    opted_in = true,
    confirmed_by_pot_master = false,
    confirmed_at = NULL,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_event_prize_pool_member_entrant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_event_prize_pool_member_entrant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_event_prize_pool_member_entrant(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.insert_event_prize_pool_member_entrant(uuid, uuid) IS
  'Adds or re-opts-in a member row for a prize pool (Pot Master / ManCo).';

NOTIFY pgrst, 'reload schema';
