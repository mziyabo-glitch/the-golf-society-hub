-- Prize pool entries are scoped to a specific pool (competition), not event + competition_type.

ALTER TABLE public.event_prize_pool_entries
  ADD COLUMN IF NOT EXISTS pool_id uuid REFERENCES public.event_prize_pools(id) ON DELETE CASCADE;

UPDATE public.event_prize_pool_entries e
SET pool_id = (
  SELECT p.id
  FROM public.event_prize_pools p
  WHERE p.event_id = e.event_id
    AND p.competition_type = e.competition_type
  ORDER BY p.created_at ASC
  LIMIT 1
)
WHERE e.pool_id IS NULL;

UPDATE public.event_prize_pool_entries e
SET pool_id = (
  SELECT p.id
  FROM public.event_prize_pools p
  WHERE p.event_id = e.event_id
  ORDER BY p.created_at ASC
  LIMIT 1
)
WHERE e.pool_id IS NULL;

DELETE FROM public.event_prize_pool_entries WHERE pool_id IS NULL;

ALTER TABLE public.event_prize_pool_entries
  ALTER COLUMN pool_id SET NOT NULL;

DROP INDEX IF EXISTS event_prize_pool_entries_event_comp_member_uniq;
DROP INDEX IF EXISTS event_prize_pool_entries_event_comp_guest_uniq;
DROP INDEX IF EXISTS idx_event_prize_pool_entries_event_comp;

CREATE UNIQUE INDEX IF NOT EXISTS event_prize_pool_entries_pool_member_uniq
  ON public.event_prize_pool_entries (pool_id, member_id)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_prize_pool_entries_pool_guest_uniq
  ON public.event_prize_pool_entries (pool_id, guest_id)
  WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_prize_pool_entries_pool_id ON public.event_prize_pool_entries (pool_id);

ALTER TABLE public.event_prize_pool_entries
  DROP CONSTRAINT IF EXISTS event_prize_pool_entries_competition_type_chk;

ALTER TABLE public.event_prize_pool_entries
  DROP COLUMN IF EXISTS competition_type;

COMMENT ON COLUMN public.event_prize_pool_entries.pool_id IS
  'Prize pool this entry belongs to; opt-in and Pot Master confirmation are per pool.';

DROP FUNCTION IF EXISTS public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean, text);
DROP FUNCTION IF EXISTS public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.upsert_my_prize_pool_entry(
  p_pool_id uuid,
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
  v_event_id uuid;
  v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT event_id INTO v_event_id FROM public.event_prize_pools WHERE id = p_pool_id;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Prize pool not found.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = p_member_id
      AND m.user_id = auth.uid()
      AND m.society_id IN (SELECT society_id FROM public.event_prize_pool_linked_society_ids(v_event_id))
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'You cannot update prize pool opt-in for this member.';
  END IF;

  IF NOT COALESCE((SELECT prize_pool_enabled FROM public.events WHERE id = v_event_id), false) THEN
    RAISE EXCEPTION 'Prize pool is not enabled for this event.';
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
    NULL,
    'member',
    p_opted_in,
    false,
    NULL
  )
  ON CONFLICT (pool_id, member_id) WHERE member_id IS NOT NULL DO UPDATE SET
    opted_in = EXCLUDED.opted_in,
    confirmed_by_pot_master = false,
    confirmed_at = NULL,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_prize_pool_entry(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_my_prize_pool_entry(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_prize_pool_entry(uuid, uuid, boolean) TO service_role;

DROP FUNCTION IF EXISTS public.insert_event_prize_pool_guest_entrant(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.insert_event_prize_pool_guest_entrant(
  p_pool_id uuid,
  p_guest_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_event_id uuid;
  v_name text;
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

  SELECT g.name INTO v_name
  FROM public.event_guests g
  WHERE g.id = p_guest_id AND g.event_id = v_event_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Guest not found for this event.';
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
    NULL,
    p_guest_id,
    NULLIF(trim(v_name), ''),
    'guest',
    true,
    false,
    NULL
  )
  ON CONFLICT (pool_id, guest_id) WHERE guest_id IS NOT NULL DO UPDATE SET
    participant_name = EXCLUDED.participant_name,
    opted_in = true,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_event_prize_pool_guest_entrant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_event_prize_pool_guest_entrant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_event_prize_pool_guest_entrant(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
