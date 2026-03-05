-- 046_handicap_lock.sql
-- Handicap lock: members can self-edit HI only when unlocked.
-- Captain/Handicapper can edit anyone + toggle the lock.

-- ============================================================================
-- 1. Add columns
-- ============================================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS handicap_lock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS handicap_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS handicap_updated_by uuid;

-- ============================================================================
-- 2. Audit trigger — auto-set updated_at/by when handicap_index changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_handicap_audit_fields()
RETURNS trigger LANGUAGE plpgsql AS $haf$
BEGIN
  IF NEW.handicap_index IS DISTINCT FROM OLD.handicap_index THEN
    NEW.handicap_updated_at := now();
    NEW.handicap_updated_by := auth.uid();
  END IF;
  RETURN NEW;
END
$haf$;

DROP TRIGGER IF EXISTS trg_members_handicap_audit ON public.members;
CREATE TRIGGER trg_members_handicap_audit
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.set_handicap_audit_fields();

-- ============================================================================
-- 3. RPC: update_handicap  (hardened — enforces lock server-side)
-- ============================================================================
-- Members call this for self-edit (respects lock).
-- Captain/Handicapper call this for any member (bypasses lock, can toggle lock).

DROP FUNCTION IF EXISTS public.update_handicap(uuid, numeric, boolean);

CREATE FUNCTION public.update_handicap(
  p_member_id      uuid,
  p_handicap_index numeric DEFAULT NULL,
  p_lock           boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $uh$
DECLARE
  v_uid          uuid := auth.uid();
  v_target       record;
  v_caller_role  text;
  v_is_admin     boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id, society_id, user_id, handicap_lock
    INTO v_target
    FROM public.members WHERE id = p_member_id;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;

  -- Check if caller is captain/handicapper in same society
  SELECT role INTO v_caller_role
    FROM public.members
   WHERE society_id = v_target.society_id AND user_id = v_uid
   LIMIT 1;

  v_is_admin := upper(coalesce(v_caller_role, '')) IN ('CAPTAIN', 'HANDICAPPER');

  -- Self-edit: must be own row + not locked
  IF NOT v_is_admin THEN
    IF v_target.user_id <> v_uid THEN
      RAISE EXCEPTION 'You can only edit your own handicap';
    END IF;
    IF v_target.handicap_lock THEN
      RAISE EXCEPTION 'Your handicap is locked by the Handicapper. Contact them to make changes.';
    END IF;
    -- Self cannot change lock
    IF p_lock IS NOT NULL THEN
      RAISE EXCEPTION 'Only Handicapper or Captain can lock/unlock handicaps';
    END IF;
  END IF;

  -- Apply updates
  UPDATE public.members
     SET handicap_index = coalesce(p_handicap_index, handicap_index),
         handicap_lock  = coalesce(p_lock, handicap_lock)
   WHERE id = p_member_id;
END
$uh$;

GRANT EXECUTE ON FUNCTION public.update_handicap(uuid, numeric, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
