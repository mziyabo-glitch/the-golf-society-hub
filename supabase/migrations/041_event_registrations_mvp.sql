-- 041_event_registrations_mvp.sql
-- MVP: per-member attendance ("in"/"out") and payment status per event.
-- Run in Supabase Dashboard > SQL Editor as a single query.

-- ============================================================================
-- 1. Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_registrations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id           uuid        NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  event_id             uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id            uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status               text        NOT NULL DEFAULT 'in' CHECK (status IN ('in', 'out')),
  paid                 boolean     NOT NULL DEFAULT false,
  amount_paid_pence    integer     NOT NULL DEFAULT 0,
  paid_at              timestamptz,
  marked_by_member_id  uuid        REFERENCES public.members(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_registrations_event_member_uq UNIQUE (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_event_reg_event   ON public.event_registrations (event_id);
CREATE INDEX IF NOT EXISTS idx_event_reg_member  ON public.event_registrations (member_id);
CREATE INDEX IF NOT EXISTS idx_event_reg_soc_evt ON public.event_registrations (society_id, event_id);

-- ============================================================================
-- 2. updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $t$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$t$;

DROP TRIGGER IF EXISTS trg_event_reg_updated ON public.event_registrations;
CREATE TRIGGER trg_event_reg_updated
  BEFORE UPDATE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. RLS
-- ============================================================================

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_reg_select      ON public.event_registrations;
DROP POLICY IF EXISTS event_reg_insert_self ON public.event_registrations;
DROP POLICY IF EXISTS event_reg_update_self ON public.event_registrations;
DROP POLICY IF EXISTS event_reg_delete_self ON public.event_registrations;

CREATE POLICY event_reg_select
  ON public.event_registrations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid() AND m.society_id = event_registrations.society_id
  ));

CREATE POLICY event_reg_insert_self
  ON public.event_registrations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid()
      AND m.id = event_registrations.member_id
      AND m.society_id = event_registrations.society_id
  ));

CREATE POLICY event_reg_update_self
  ON public.event_registrations FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid()
      AND m.id = event_registrations.member_id
      AND m.society_id = event_registrations.society_id
  ));

CREATE POLICY event_reg_delete_self
  ON public.event_registrations FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid()
      AND m.id = event_registrations.member_id
      AND m.society_id = event_registrations.society_id
  ));

-- ============================================================================
-- 4. RPC: mark_event_paid  (Captain / Treasurer only)
-- ============================================================================

DROP FUNCTION IF EXISTS public.mark_event_paid(uuid, uuid, boolean, integer);

CREATE FUNCTION public.mark_event_paid(
  p_event_id          uuid,
  p_target_member_id  uuid,
  p_paid              boolean,
  p_amount_pence      integer DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid        uuid := auth.uid();
  v_society_id uuid;
  v_caller_id  uuid;
  v_caller_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT e.society_id INTO v_society_id FROM public.events e WHERE e.id = p_event_id;
  IF v_society_id IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  SELECT m.id, m.role INTO v_caller_id, v_caller_role
    FROM public.members m
   WHERE m.society_id = v_society_id AND m.user_id = v_uid LIMIT 1;

  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not a member of this society'; END IF;
  IF upper(coalesce(v_caller_role,'')) NOT IN ('CAPTAIN','TREASURER') THEN
    RAISE EXCEPTION 'Only Captain or Treasurer can mark payments';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_target_member_id AND society_id = v_society_id) THEN
    RAISE EXCEPTION 'Target member not found in this society';
  END IF;

  INSERT INTO public.event_registrations
         (society_id, event_id, member_id, status, paid, amount_paid_pence, paid_at, marked_by_member_id)
  VALUES (v_society_id, p_event_id, p_target_member_id, 'in',
          p_paid,
          CASE WHEN p_paid THEN coalesce(p_amount_pence,0) ELSE 0 END,
          CASE WHEN p_paid THEN now() ELSE null END,
          v_caller_id)
  ON CONFLICT (event_id, member_id) DO UPDATE SET
    paid                = EXCLUDED.paid,
    amount_paid_pence   = EXCLUDED.amount_paid_pence,
    paid_at             = EXCLUDED.paid_at,
    marked_by_member_id = EXCLUDED.marked_by_member_id;
END
$f$;

GRANT EXECUTE ON FUNCTION public.mark_event_paid(uuid,uuid,boolean,integer) TO authenticated;
