-- Separate optional participation scope for Pot vs Pot Splitter.
-- Entrant opt-in / confirmation is now competition-scoped.

ALTER TABLE public.event_prize_pool_entries
  ADD COLUMN IF NOT EXISTS competition_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.event_prize_pool_entries
  DROP CONSTRAINT IF EXISTS event_prize_pool_entries_competition_type_chk;

ALTER TABLE public.event_prize_pool_entries
  ADD CONSTRAINT event_prize_pool_entries_competition_type_chk
  CHECK (competition_type IN ('standard', 'splitter'));

UPDATE public.event_prize_pool_entries
SET competition_type = COALESCE(NULLIF(trim(competition_type), ''), 'standard')
WHERE competition_type IS NULL OR competition_type = '';

DROP INDEX IF EXISTS event_prize_pool_entries_event_member_uniq;
DROP INDEX IF EXISTS event_prize_pool_entries_event_guest_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS event_prize_pool_entries_event_comp_member_uniq
  ON public.event_prize_pool_entries (event_id, competition_type, member_id)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_prize_pool_entries_event_comp_guest_uniq
  ON public.event_prize_pool_entries (event_id, competition_type, guest_id)
  WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_prize_pool_entries_event_comp
  ON public.event_prize_pool_entries (event_id, competition_type);

COMMENT ON COLUMN public.event_prize_pool_entries.competition_type IS
  'Optional-entry scope for the competition: standard (Prize Pool Pot) or splitter (Prize Pool Pot Splitter).';

-- Recreate opt-in RPC with competition scope.
DROP FUNCTION IF EXISTS public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean);
CREATE OR REPLACE FUNCTION public.upsert_my_event_prize_pool_entry(
  p_event_id uuid,
  p_member_id uuid,
  p_opted_in boolean,
  p_competition_type text DEFAULT 'standard'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_ok boolean;
  v_competition_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_competition_type := COALESCE(NULLIF(trim(p_competition_type), ''), 'standard');
  IF v_competition_type NOT IN ('standard', 'splitter') THEN
    RAISE EXCEPTION 'Invalid competition type.';
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
    competition_type,
    member_id,
    guest_id,
    participant_name,
    participant_type,
    opted_in,
    confirmed_by_pot_master,
    confirmed_at
  ) VALUES (
    p_event_id,
    v_competition_type,
    p_member_id,
    NULL,
    NULL,
    'member',
    p_opted_in,
    false,
    NULL
  )
  ON CONFLICT (event_id, competition_type, member_id) WHERE member_id IS NOT NULL DO UPDATE SET
    opted_in = EXCLUDED.opted_in,
    confirmed_by_pot_master = false,
    confirmed_at = NULL,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean, text) TO service_role;

-- Recreate guest insert RPC with competition scope.
DROP FUNCTION IF EXISTS public.insert_event_prize_pool_guest_entrant(uuid, uuid);
CREATE OR REPLACE FUNCTION public.insert_event_prize_pool_guest_entrant(
  p_event_id uuid,
  p_guest_id uuid,
  p_competition_type text DEFAULT 'standard'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_name text;
  v_id uuid;
  v_competition_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_competition_type := COALESCE(NULLIF(trim(p_competition_type), ''), 'standard');
  IF v_competition_type NOT IN ('standard', 'splitter') THEN
    RAISE EXCEPTION 'Invalid competition type.';
  END IF;

  IF NOT public.user_can_manage_event_prize_pools(p_event_id) THEN
    RAISE EXCEPTION 'Permission denied.';
  END IF;

  IF NOT COALESCE((SELECT prize_pool_enabled FROM public.events WHERE id = p_event_id), false) THEN
    RAISE EXCEPTION 'Prize pool is not enabled for this event.';
  END IF;

  SELECT g.name INTO v_name
  FROM public.event_guests g
  WHERE g.id = p_guest_id AND g.event_id = p_event_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Guest not found for this event.';
  END IF;

  INSERT INTO public.event_prize_pool_entries (
    event_id,
    competition_type,
    member_id,
    guest_id,
    participant_name,
    participant_type,
    opted_in,
    confirmed_by_pot_master,
    confirmed_at
  ) VALUES (
    p_event_id,
    v_competition_type,
    NULL,
    p_guest_id,
    NULLIF(trim(v_name), ''),
    'guest',
    true,
    false,
    NULL
  )
  ON CONFLICT (event_id, competition_type, guest_id) WHERE guest_id IS NOT NULL DO UPDATE SET
    participant_name = EXCLUDED.participant_name,
    opted_in = true,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_event_prize_pool_guest_entrant(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_event_prize_pool_guest_entrant(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_event_prize_pool_guest_entrant(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
