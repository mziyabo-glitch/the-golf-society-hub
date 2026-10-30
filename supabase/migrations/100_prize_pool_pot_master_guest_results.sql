-- Prize pool v1: Pot Master confirmed entrants, guest support, guest event_results,
-- remove prize-pool payment tracking, invalidate calculated pools when official results change.

-- ---------------------------------------------------------------------------
-- event_results: one row per member OR per guest (per society for guests)
-- ---------------------------------------------------------------------------

ALTER TABLE public.event_results
  ADD COLUMN IF NOT EXISTS event_guest_id uuid REFERENCES public.event_guests(id) ON DELETE CASCADE;

ALTER TABLE public.event_results
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE public.event_results
  DROP CONSTRAINT IF EXISTS event_results_event_id_member_id_key;

ALTER TABLE public.event_results
  DROP CONSTRAINT IF EXISTS event_results_member_or_guest_chk;

ALTER TABLE public.event_results
  ADD CONSTRAINT event_results_member_or_guest_chk CHECK (
    (member_id IS NOT NULL AND event_guest_id IS NULL)
    OR (member_id IS NULL AND event_guest_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS event_results_event_member_uniq
  ON public.event_results (event_id, member_id)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_results_event_society_guest_uniq
  ON public.event_results (event_id, society_id, event_guest_id)
  WHERE event_guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_results_event_guest_id ON public.event_results (event_guest_id)
  WHERE event_guest_id IS NOT NULL;

COMMENT ON COLUMN public.event_results.event_guest_id IS
  'When set, this row is an official result for an event guest (member_id is null).';

-- ---------------------------------------------------------------------------
-- event_prize_pool_results: payout rows may reference a guest
-- ---------------------------------------------------------------------------

ALTER TABLE public.event_prize_pool_results
  ADD COLUMN IF NOT EXISTS event_guest_id uuid REFERENCES public.event_guests(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS event_prize_pool_results_member_finish_uq;

CREATE UNIQUE INDEX IF NOT EXISTS event_prize_pool_results_member_finish_uq
  ON public.event_prize_pool_results (pool_id, member_id, COALESCE(division_name, ''), finishing_position)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_prize_pool_results_guest_finish_uq
  ON public.event_prize_pool_results (pool_id, event_guest_id, COALESCE(division_name, ''), finishing_position)
  WHERE event_guest_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Prize pool config: do not gate on paid/confirmed attendance (v1)
-- ---------------------------------------------------------------------------

UPDATE public.event_prize_pools SET require_paid = false, require_confirmed = false;

ALTER TABLE public.event_prize_pools
  ALTER COLUMN require_paid SET DEFAULT false;

ALTER TABLE public.event_prize_pools
  ALTER COLUMN require_confirmed SET DEFAULT false;

-- ---------------------------------------------------------------------------
-- event_prize_pool_entries: members + guests, opt-in + Pot Master confirmation
-- ---------------------------------------------------------------------------

ALTER TABLE public.event_prize_pool_entries
  DROP CONSTRAINT IF EXISTS event_prize_pool_entries_event_member_uq;

ALTER TABLE public.event_prize_pool_entries
  ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.event_guests(id) ON DELETE CASCADE;

ALTER TABLE public.event_prize_pool_entries
  ADD COLUMN IF NOT EXISTS participant_name text;

ALTER TABLE public.event_prize_pool_entries
  ADD COLUMN IF NOT EXISTS participant_type text NOT NULL DEFAULT 'member';

ALTER TABLE public.event_prize_pool_entries
  ADD COLUMN IF NOT EXISTS opted_in boolean NOT NULL DEFAULT false;

ALTER TABLE public.event_prize_pool_entries
  ADD COLUMN IF NOT EXISTS confirmed_by_pot_master boolean NOT NULL DEFAULT false;

ALTER TABLE public.event_prize_pool_entries
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE public.event_prize_pool_entries
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Migrate from legacy columns (099)
UPDATE public.event_prize_pool_entries e
SET
  participant_type = 'member',
  participant_name = COALESCE(NULLIF(trim(m.name), ''), 'Member'),
  opted_in = COALESCE(e.wants_to_enter, false),
  confirmed_by_pot_master = COALESCE(e.wants_to_enter, false),
  confirmed_at = CASE WHEN COALESCE(e.wants_to_enter, false) THEN COALESCE(e.entered_at, now()) ELSE NULL END,
  created_at = COALESCE(e.entered_at, now())
FROM public.members m
WHERE e.member_id IS NOT NULL AND m.id = e.member_id;

ALTER TABLE public.event_prize_pool_entries
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE public.event_prize_pool_entries
  DROP COLUMN IF EXISTS wants_to_enter;

ALTER TABLE public.event_prize_pool_entries
  DROP COLUMN IF EXISTS payment_status;

ALTER TABLE public.event_prize_pool_entries
  DROP COLUMN IF EXISTS entered_at;

ALTER TABLE public.event_prize_pool_entries
  DROP COLUMN IF EXISTS paid_at;

ALTER TABLE public.event_prize_pool_entries
  DROP COLUMN IF EXISTS notes;

ALTER TABLE public.event_prize_pool_entries
  DROP CONSTRAINT IF EXISTS event_prize_pool_entries_participant_chk;

ALTER TABLE public.event_prize_pool_entries
  ADD CONSTRAINT event_prize_pool_entries_participant_chk CHECK (
    participant_type IN ('member', 'guest')
    AND (
      (participant_type = 'member' AND member_id IS NOT NULL AND guest_id IS NULL)
      OR (participant_type = 'guest' AND guest_id IS NOT NULL AND member_id IS NULL)
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS event_prize_pool_entries_event_member_uniq
  ON public.event_prize_pool_entries (event_id, member_id)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_prize_pool_entries_event_guest_uniq
  ON public.event_prize_pool_entries (event_id, guest_id)
  WHERE guest_id IS NOT NULL;

DROP INDEX IF EXISTS idx_event_prize_pool_entries_member_id;

CREATE INDEX IF NOT EXISTS idx_event_prize_pool_entries_member_id ON public.event_prize_pool_entries (member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_prize_pool_entries_guest_id ON public.event_prize_pool_entries (guest_id)
  WHERE guest_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS: entries (same visibility; writes still RPC-only for mutations)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS event_prize_pool_entries_select ON public.event_prize_pool_entries;

CREATE POLICY event_prize_pool_entries_select
  ON public.event_prize_pool_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members me
      WHERE me.id = public.event_prize_pool_entries.member_id
        AND me.user_id = auth.uid()
    )
    OR public.user_can_manage_event_prize_pools(event_id)
  );

-- ---------------------------------------------------------------------------
-- Drop payment RPC + helper (v1)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.set_event_prize_pool_entry_payment(uuid, uuid, text, text);

DROP FUNCTION IF EXISTS public.user_can_set_event_prize_pool_entry_payment(uuid);

-- Same signature (uuid, uuid, boolean) as 099 but parameter renamed p_wants_to_enter → p_opted_in;
-- Postgres forbids renaming parameters via CREATE OR REPLACE (42P13).
DROP FUNCTION IF EXISTS public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean);

-- ---------------------------------------------------------------------------
-- Member opt-in (request only — Pot Master confirms separately)
-- ---------------------------------------------------------------------------

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

-- Pot Master: confirm / unconfirm an entrant row
CREATE OR REPLACE FUNCTION public.set_event_prize_pool_entry_pot_master_confirmation(
  p_entry_id uuid,
  p_confirmed boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT event_id INTO v_event_id
  FROM public.event_prize_pool_entries
  WHERE id = p_entry_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Entry not found.';
  END IF;

  IF NOT public.user_can_manage_event_prize_pools(v_event_id) THEN
    RAISE EXCEPTION 'Permission denied.';
  END IF;

  UPDATE public.event_prize_pool_entries
  SET
    confirmed_by_pot_master = p_confirmed,
    confirmed_at = CASE WHEN p_confirmed THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_event_prize_pool_entry_pot_master_confirmation(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_event_prize_pool_entry_pot_master_confirmation(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_prize_pool_entry_pot_master_confirmation(uuid, boolean) TO service_role;

-- Pot Master: add a guest to the prize pool entrant list (creates row; Pot Master confirms separately)
CREATE OR REPLACE FUNCTION public.insert_event_prize_pool_guest_entrant(
  p_event_id uuid,
  p_guest_id uuid
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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
    member_id,
    guest_id,
    participant_name,
    participant_type,
    opted_in,
    confirmed_by_pot_master,
    confirmed_at
  ) VALUES (
    p_event_id,
    NULL,
    p_guest_id,
    NULLIF(trim(v_name), ''),
    'guest',
    true,
    false,
    NULL
  )
  ON CONFLICT (event_id, guest_id) WHERE guest_id IS NOT NULL DO UPDATE SET
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

-- Pot Master: remove an entrant row
CREATE OR REPLACE FUNCTION public.delete_event_prize_pool_entry(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT event_id INTO v_event_id FROM public.event_prize_pool_entries WHERE id = p_entry_id;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Entry not found.';
  END IF;

  IF NOT public.user_can_manage_event_prize_pools(v_event_id) THEN
    RAISE EXCEPTION 'Permission denied.';
  END IF;

  DELETE FROM public.event_prize_pool_entries WHERE id = p_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_event_prize_pool_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_event_prize_pool_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_prize_pool_entry(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- When official results change, non-finalised calculated pools revert to draft
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invalidate_calculated_prize_pools_for_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  IF v_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.event_prize_pool_results r
  USING public.event_prize_pools p
  WHERE r.pool_id = p.id
    AND p.event_id = v_event_id
    AND p.status = 'calculated';

  UPDATE public.event_prize_pools p
  SET status = 'draft', last_calculated_at = NULL
  WHERE p.event_id = v_event_id
    AND p.status = 'calculated';

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.invalidate_calculated_prize_pools_for_event() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invalidate_calculated_prize_pools_for_event() TO authenticated;
GRANT EXECUTE ON FUNCTION public.invalidate_calculated_prize_pools_for_event() TO service_role;

DROP TRIGGER IF EXISTS trg_event_results_invalidate_prize_pools ON public.event_results;
CREATE TRIGGER trg_event_results_invalidate_prize_pools
  AFTER INSERT OR UPDATE OR DELETE ON public.event_results
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_calculated_prize_pools_for_event();

NOTIFY pgrst, 'reload schema';
