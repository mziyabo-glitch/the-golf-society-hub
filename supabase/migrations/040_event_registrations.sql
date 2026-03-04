-- 040_event_registrations.sql
-- Track per-member attendance ("in"/"out") and payment status per event.

-- ============================================================================
-- 1. Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_registrations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id           uuid        NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  event_id             uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id            uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status               text        NOT NULL DEFAULT 'in'
                                   CHECK (status IN ('in', 'out')),
  paid                 boolean     NOT NULL DEFAULT false,
  amount_paid_pence    integer     NOT NULL DEFAULT 0,
  paid_at              timestamptz,
  marked_by_member_id  uuid        REFERENCES public.members(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_registrations
  ADD CONSTRAINT event_registrations_event_member_uq UNIQUE (event_id, member_id);

-- ============================================================================
-- 2. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_event_reg_event    ON public.event_registrations (event_id);
CREATE INDEX IF NOT EXISTS idx_event_reg_member   ON public.event_registrations (member_id);
CREATE INDEX IF NOT EXISTS idx_event_reg_soc_evt  ON public.event_registrations (society_id, event_id);

-- ============================================================================
-- 3. Auto-update updated_at trigger (reuse set_updated_at from 038)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_event_registrations_updated_at ON public.event_registrations;

CREATE TRIGGER trg_event_registrations_updated_at
  BEFORE UPDATE ON public.event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 4. RLS
-- ============================================================================

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated member of the same society
CREATE POLICY event_reg_select
  ON public.event_registrations
  FOR SELECT
  TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
  );

-- INSERT: members can insert their own row only
CREATE POLICY event_reg_insert_self
  ON public.event_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    member_id IN (
      SELECT m.id FROM public.members m
      WHERE m.user_id = auth.uid() AND m.society_id = society_id
    )
  );

-- UPDATE: members can update status on their own row
CREATE POLICY event_reg_update_self
  ON public.event_registrations
  FOR UPDATE
  TO authenticated
  USING (
    member_id IN (
      SELECT m.id FROM public.members m
      WHERE m.user_id = auth.uid() AND m.society_id = society_id
    )
  );

-- DELETE: members can delete their own row
CREATE POLICY event_reg_delete_self
  ON public.event_registrations
  FOR DELETE
  TO authenticated
  USING (
    member_id IN (
      SELECT m.id FROM public.members m
      WHERE m.user_id = auth.uid() AND m.society_id = society_id
    )
  );

-- ============================================================================
-- 5. RPC: mark_event_paid (Captain/Treasurer only)
-- ============================================================================
-- Payment fields are updated via this SECURITY DEFINER RPC so we don't need
-- a separate broad UPDATE policy for captain/treasurer.

DROP FUNCTION IF EXISTS public.mark_event_paid(uuid, uuid, boolean, integer);

CREATE FUNCTION public.mark_event_paid(
  p_event_id     uuid,
  p_member_id    uuid,
  p_paid         boolean,
  p_amount_pence integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_society_id   uuid;
  v_caller_id    uuid;
  v_caller_role  text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve society from the event
  SELECT e.society_id INTO v_society_id
  FROM public.events e WHERE e.id = p_event_id;
  IF v_society_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Resolve caller's member row + role in that society
  SELECT m.id, m.role INTO v_caller_id, v_caller_role
  FROM public.members m
  WHERE m.society_id = v_society_id AND m.user_id = v_user_id
  LIMIT 1;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;
  IF UPPER(COALESCE(v_caller_role, '')) NOT IN ('CAPTAIN', 'TREASURER') THEN
    RAISE EXCEPTION 'Only Captain or Treasurer can mark payments';
  END IF;

  -- Upsert the registration row
  INSERT INTO public.event_registrations (society_id, event_id, member_id, status, paid, amount_paid_pence, paid_at, marked_by_member_id)
  VALUES (
    v_society_id,
    p_event_id,
    p_member_id,
    'in',
    p_paid,
    CASE WHEN p_paid THEN COALESCE(p_amount_pence, 0) ELSE 0 END,
    CASE WHEN p_paid THEN now() ELSE NULL END,
    v_caller_id
  )
  ON CONFLICT (event_id, member_id)
  DO UPDATE SET
    paid                = EXCLUDED.paid,
    amount_paid_pence   = EXCLUDED.amount_paid_pence,
    paid_at             = EXCLUDED.paid_at,
    marked_by_member_id = EXCLUDED.marked_by_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_event_paid(uuid, uuid, boolean, integer)
  TO authenticated;

COMMENT ON FUNCTION public.mark_event_paid(uuid, uuid, boolean, integer) IS
  'Captain/Treasurer marks a member paid/unpaid for an event. Upserts the registration row.';

NOTIFY pgrst, 'reload schema';
