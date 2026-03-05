-- 045_fix_seat_assignment_rpcs.sql
-- Re-deploy assign_society_seat and remove_society_seat RPCs.
-- Fixes 404 / "relation society_members does not exist" error.

-- Ensure has_seat column exists
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS has_seat boolean NOT NULL DEFAULT false;

-- Ensure societies has seat tracking columns
ALTER TABLE public.societies ADD COLUMN IF NOT EXISTS seats_total integer NOT NULL DEFAULT 0;
ALTER TABLE public.societies ADD COLUMN IF NOT EXISTS seats_used integer NOT NULL DEFAULT 0;

-- ============================================================================
-- Trigger: keep societies.seats_used in sync
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_society_seats_used()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $t$
DECLARE
  v_sid uuid;
BEGIN
  v_sid := CASE WHEN TG_OP = 'DELETE' THEN OLD.society_id ELSE NEW.society_id END;
  UPDATE public.societies
     SET seats_used = (SELECT count(*) FROM public.members WHERE society_id = v_sid AND has_seat = true)
   WHERE id = v_sid;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$t$;

DROP TRIGGER IF EXISTS trg_sync_seats_used ON public.members;
CREATE TRIGGER trg_sync_seats_used
  AFTER INSERT OR UPDATE OF has_seat OR DELETE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.sync_society_seats_used();

-- ============================================================================
-- assign_society_seat (Captain only)
-- ============================================================================

DROP FUNCTION IF EXISTS public.assign_society_seat(uuid, uuid);

CREATE FUNCTION public.assign_society_seat(
  p_society_id uuid,
  p_member_id  uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_caller_role text;
  v_target_soc  uuid;
  v_already     boolean;
  v_total       int;
  v_used        int;
BEGIN
  SELECT role INTO v_caller_role FROM public.members
   WHERE society_id = p_society_id AND user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS NULL OR lower(v_caller_role) <> 'captain' THEN
    RAISE EXCEPTION 'Only the Captain can assign licences.';
  END IF;

  SELECT society_id, has_seat INTO v_target_soc, v_already
    FROM public.members WHERE id = p_member_id;

  IF v_target_soc IS NULL THEN RAISE EXCEPTION 'Member not found.'; END IF;
  IF v_target_soc <> p_society_id THEN RAISE EXCEPTION 'Member does not belong to this society.'; END IF;
  IF v_already THEN RETURN; END IF;

  SELECT seats_total, seats_used INTO v_total, v_used FROM public.societies WHERE id = p_society_id;
  IF v_used >= v_total THEN RAISE EXCEPTION 'No available licences. Purchase more seats first.'; END IF;

  UPDATE public.members SET has_seat = true WHERE id = p_member_id;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.assign_society_seat(uuid, uuid) TO authenticated;

-- ============================================================================
-- remove_society_seat (Captain only)
-- ============================================================================

DROP FUNCTION IF EXISTS public.remove_society_seat(uuid, uuid);

CREATE FUNCTION public.remove_society_seat(
  p_society_id uuid,
  p_member_id  uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn2$
DECLARE
  v_caller_role text;
  v_target_soc  uuid;
  v_already     boolean;
BEGIN
  SELECT role INTO v_caller_role FROM public.members
   WHERE society_id = p_society_id AND user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS NULL OR lower(v_caller_role) <> 'captain' THEN
    RAISE EXCEPTION 'Only the Captain can remove licences.';
  END IF;

  SELECT society_id, has_seat INTO v_target_soc, v_already
    FROM public.members WHERE id = p_member_id;

  IF v_target_soc IS NULL THEN RAISE EXCEPTION 'Member not found.'; END IF;
  IF v_target_soc <> p_society_id THEN RAISE EXCEPTION 'Member does not belong to this society.'; END IF;
  IF NOT v_already THEN RETURN; END IF;

  UPDATE public.members SET has_seat = false WHERE id = p_member_id;
END
$fn2$;

GRANT EXECUTE ON FUNCTION public.remove_society_seat(uuid, uuid) TO authenticated;

-- Back-fill seats_used
UPDATE public.societies s
   SET seats_used = (SELECT count(*) FROM public.members m WHERE m.society_id = s.id AND m.has_seat = true);

NOTIFY pgrst, 'reload schema';
