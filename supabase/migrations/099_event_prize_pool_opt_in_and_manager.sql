-- Prize pool opt-in, per-event Prize Pool Manager, and event-level settings.
-- Extends 098: replaces user_can_manage_event_prize_pools to include appointed managers.

-- ---------------------------------------------------------------------------
-- Event columns: feature flag + payment instructions (bank text)
-- ---------------------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS prize_pool_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS prize_pool_payment_instructions text;

COMMENT ON COLUMN public.events.prize_pool_enabled IS
  'When true, members in linked societies may opt into the optional prize pool for this event.';
COMMENT ON COLUMN public.events.prize_pool_payment_instructions IS
  'Optional payment instructions (e.g. bank details) for the prize pool — shown to opted-in members.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_member_of_event_linked_society(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_prize_pool_linked_society_ids(p_event_id) ls
    WHERE ls.society_id IN (SELECT public.my_society_ids())
  );
$$;

REVOKE ALL ON FUNCTION public.user_member_of_event_linked_society(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_member_of_event_linked_society(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_member_of_event_linked_society(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.user_is_captain_in_event_linked_societies(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_prize_pool_linked_society_ids(p_event_id) ls
    WHERE public.has_role_in_society(ls.society_id, ARRAY['captain'])
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_captain_in_event_linked_societies(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_captain_in_event_linked_societies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_captain_in_event_linked_societies(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.user_is_event_prize_pool_manager(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_prize_pool_managers pm
    JOIN public.members mem ON mem.id = pm.member_id
    WHERE pm.event_id = p_event_id
      AND mem.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_event_prize_pool_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_event_prize_pool_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_event_prize_pool_manager(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.user_can_manage_event_prize_pools(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.user_is_event_prize_pool_manager(p_event_id)
  OR EXISTS (
    SELECT 1
    FROM public.event_prize_pool_linked_society_ids(p_event_id) ls
    JOIN public.members m ON m.society_id = ls.society_id
    WHERE m.user_id = auth.uid()
      AND public.has_role_in_society(
        m.society_id,
        ARRAY['captain', 'secretary', 'treasurer', 'handicapper']
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_event_prize_pools(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_event_prize_pools(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_manage_event_prize_pools(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.user_can_set_event_prize_pool_entry_payment(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.user_is_event_prize_pool_manager(p_event_id)
  OR public.user_is_captain_in_event_linked_societies(p_event_id);
$$;

REVOKE ALL ON FUNCTION public.user_can_set_event_prize_pool_entry_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_set_event_prize_pool_entry_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_set_event_prize_pool_entry_payment(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_prize_pool_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  appointed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_prize_pool_managers_event_uq UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_prize_pool_managers_event_id ON public.event_prize_pool_managers (event_id);
CREATE INDEX IF NOT EXISTS idx_event_prize_pool_managers_member_id ON public.event_prize_pool_managers (member_id);

ALTER TABLE public.event_prize_pool_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_prize_pool_managers_select ON public.event_prize_pool_managers;
DROP POLICY IF EXISTS event_prize_pool_managers_insert ON public.event_prize_pool_managers;
DROP POLICY IF EXISTS event_prize_pool_managers_update ON public.event_prize_pool_managers;
DROP POLICY IF EXISTS event_prize_pool_managers_delete ON public.event_prize_pool_managers;

CREATE POLICY event_prize_pool_managers_select
  ON public.event_prize_pool_managers FOR SELECT TO authenticated
  USING (public.user_member_of_event_linked_society(event_id));

CREATE POLICY event_prize_pool_managers_insert
  ON public.event_prize_pool_managers FOR INSERT TO authenticated
  WITH CHECK (public.user_is_captain_in_event_linked_societies(event_id));

CREATE POLICY event_prize_pool_managers_update
  ON public.event_prize_pool_managers FOR UPDATE TO authenticated
  USING (public.user_is_captain_in_event_linked_societies(event_id))
  WITH CHECK (public.user_is_captain_in_event_linked_societies(event_id));

CREATE POLICY event_prize_pool_managers_delete
  ON public.event_prize_pool_managers FOR DELETE TO authenticated
  USING (public.user_is_captain_in_event_linked_societies(event_id));

CREATE TABLE IF NOT EXISTS public.event_prize_pool_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  wants_to_enter boolean NOT NULL DEFAULT false,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'waived')),
  entered_at timestamptz,
  paid_at timestamptz,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_prize_pool_entries_event_member_uq UNIQUE (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_event_prize_pool_entries_event_id ON public.event_prize_pool_entries (event_id);
CREATE INDEX IF NOT EXISTS idx_event_prize_pool_entries_member_id ON public.event_prize_pool_entries (member_id);

DROP TRIGGER IF EXISTS trg_event_prize_pool_entries_updated ON public.event_prize_pool_entries;
CREATE TRIGGER trg_event_prize_pool_entries_updated
  BEFORE UPDATE ON public.event_prize_pool_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.event_prize_pool_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_prize_pool_entries_select ON public.event_prize_pool_entries;
DROP POLICY IF EXISTS event_prize_pool_entries_update_payment ON public.event_prize_pool_entries;

CREATE POLICY event_prize_pool_entries_select
  ON public.event_prize_pool_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members me
      WHERE me.id = member_id AND me.user_id = auth.uid()
    )
    OR public.user_can_manage_event_prize_pools(event_id)
  );

-- Writes use SECURITY DEFINER RPCs only (opt-in + payment), so members cannot tamper with payment fields.

-- ---------------------------------------------------------------------------
-- RPC: member opt-in (separate from main event attendance / fees)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_my_event_prize_pool_entry(
  p_event_id uuid,
  p_member_id uuid,
  p_wants_to_enter boolean
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
    wants_to_enter,
    payment_status,
    entered_at
  ) VALUES (
    p_event_id,
    p_member_id,
    p_wants_to_enter,
    'pending',
    CASE WHEN p_wants_to_enter THEN now() ELSE NULL END
  )
  ON CONFLICT (event_id, member_id) DO UPDATE SET
    wants_to_enter = EXCLUDED.wants_to_enter,
    entered_at = CASE
      WHEN EXCLUDED.wants_to_enter THEN COALESCE(public.event_prize_pool_entries.entered_at, now())
      ELSE NULL
    END,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_event_prize_pool_entry(uuid, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.set_event_prize_pool_entry_payment(
  p_event_id uuid,
  p_member_id uuid,
  p_payment_status text,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.user_can_set_event_prize_pool_entry_payment(p_event_id) THEN
    RAISE EXCEPTION 'Permission denied to update prize pool payment status.';
  END IF;
  IF p_payment_status IS NULL OR lower(p_payment_status) NOT IN ('pending', 'paid', 'waived') THEN
    RAISE EXCEPTION 'Invalid payment status.';
  END IF;

  UPDATE public.event_prize_pool_entries e
  SET
    payment_status = lower(p_payment_status),
    paid_at = CASE
      WHEN lower(p_payment_status) = 'paid' THEN now()
      ELSE NULL
    END,
    notes = CASE
      WHEN p_notes IS NULL THEN e.notes
      ELSE NULLIF(trim(p_notes), '')
    END,
    updated_at = now()
  WHERE e.event_id = p_event_id
    AND e.member_id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prize pool entry not found.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_event_prize_pool_entry_payment(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_event_prize_pool_entry_payment(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_prize_pool_entry_payment(uuid, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: event settings (SECURITY DEFINER — avoids host-only events UPDATE RLS for participants)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_event_prize_pool_enabled(
  p_event_id uuid,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.user_is_captain_in_event_linked_societies(p_event_id) THEN
    RAISE EXCEPTION 'Only a Captain can change prize pool availability for this event.';
  END IF;

  UPDATE public.events
  SET prize_pool_enabled = p_enabled
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_event_prize_pool_enabled(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_event_prize_pool_enabled(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_prize_pool_enabled(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.set_event_prize_pool_payment_instructions(
  p_event_id uuid,
  p_instructions text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (
    public.user_is_event_prize_pool_manager(p_event_id)
    OR public.user_is_captain_in_event_linked_societies(p_event_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied to update payment instructions.';
  END IF;

  UPDATE public.events
  SET prize_pool_payment_instructions = NULLIF(trim(p_instructions), '')
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_event_prize_pool_payment_instructions(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_event_prize_pool_payment_instructions(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_prize_pool_payment_instructions(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
