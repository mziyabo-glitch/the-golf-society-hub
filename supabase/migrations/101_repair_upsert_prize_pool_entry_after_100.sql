-- Idempotent repair: environments where migration 100 updated `event_prize_pool_entries` but failed before
-- replacing `upsert_my_event_prize_pool_entry` still run the 099 body that references `wants_to_enter`
-- (column dropped) — any RPC call then errors. Re-apply the v100 function body.

DROP FUNCTION IF EXISTS public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.upsert_my_event_prize_pool_entry(
  p_event_id uuid,
  p_member_id uuid,
  p_opted_in boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = p_member_id
      AND m.user_id = auth.uid()
      AND m.society_id IN (SELECT society_id FROM public.event_prize_pool_linked_society_ids(p_event_id))
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'You cannot update prize pool opt-in for this member.';
  END IF;

  IF NOT COALESCE((SELECT prize_pool_enabled FROM public.events WHERE id = p_event_id), false) THEN
    RAISE EXCEPTION 'Prize pool is not enabled for this event.';
  END IF;

  INSERT INTO public.event_prize_pool_entries (
    event_id,
    member_id,
    guest_id,
    participant_name,
    participant_type,
    opted_in,
    confirmed_by_pot_master,
    confirmed_at
  ) VALUES (
    p_event_id,
    p_member_id,
    NULL,
    NULL,
    'member',
    p_opted_in,
    false,
    NULL
  )
  ON CONFLICT (event_id, member_id) WHERE member_id IS NOT NULL DO UPDATE SET
    opted_in = EXCLUDED.opted_in,
    confirmed_by_pot_master = false,
    confirmed_at = NULL,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
