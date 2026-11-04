-- Joint-event payments stay with the payer's own society.
-- Apply after 20261104021500_staging_platform_charge_apply.sql.
-- This file was not applied to production eaenzjwecrrbhibrvgsb.
-- Checkout does not read payment_beneficiary_society_id. A stored destination
-- that is not the payer society is cleared and cannot be written again.

COMMENT ON COLUMN public.event_societies.payment_beneficiary_society_id IS
  'Not used for Checkout. Joint-event payments stay with the payer society. Another society is refused.';

COMMENT ON TABLE public.event_payment_beneficiary_routes IS
  'Retired cross-society destination memory. Checkout does not read this table.';

CREATE OR REPLACE FUNCTION public.guard_event_payment_beneficiary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $guard$
DECLARE
  v_authorised boolean := coalesce(current_setting('gsh.beneficiary_write', true), '') = '1';
BEGIN
  IF TG_OP IS NULL THEN
    RAISE EXCEPTION 'payment_beneficiary_unauthorised';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.payment_beneficiary_society_id IS NOT DISTINCT FROM OLD.payment_beneficiary_society_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.payment_beneficiary_society_id IS NULL
     AND OLD.payment_beneficiary_society_id IS NOT NULL
     AND OLD.payment_beneficiary_society_id IS DISTINCT FROM OLD.society_id THEN
    DELETE FROM public.event_payment_beneficiary_routes r
     WHERE r.event_id = NEW.event_id
       AND r.payer_society_id = NEW.society_id;
    RETURN NEW;
  END IF;

  IF NEW.payment_beneficiary_society_id IS NOT NULL
     AND NEW.payment_beneficiary_society_id IS DISTINCT FROM NEW.society_id THEN
    RAISE EXCEPTION 'payment_beneficiary_own_society';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.payment_beneficiary_society_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT v_authorised THEN
    RAISE EXCEPTION 'payment_beneficiary_unauthorised';
  END IF;

  DELETE FROM public.event_payment_beneficiary_routes r
   WHERE r.event_id = NEW.event_id
     AND r.payer_society_id = NEW.society_id;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.set_event_payment_beneficiary(
  p_event_id uuid,
  p_payer_society_id uuid,
  p_beneficiary_society_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $setben$
DECLARE
  v_uid uuid := auth.uid();
  v_host uuid;
  v_role text;
  v_rows integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_event_id IS NULL OR p_payer_society_id IS NULL THEN
    RAISE EXCEPTION 'event_society_not_found';
  END IF;

  SELECT e.society_id INTO v_host FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.event_societies es
     WHERE es.event_id = p_event_id
       AND es.society_id = p_payer_society_id
  ) THEN
    RAISE EXCEPTION 'event_society_not_found';
  END IF;

  SELECT m.role
    INTO v_role
    FROM public.members m
   WHERE m.user_id = v_uid
     AND m.society_id IN (v_host, p_payer_society_id)
     AND upper(coalesce(m.role, '')) IN ('CAPTAIN', 'TREASURER')
   LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'payment_beneficiary_unauthorised';
  END IF;

  IF p_beneficiary_society_id IS DISTINCT FROM p_payer_society_id THEN
    RAISE EXCEPTION 'payment_beneficiary_own_society';
  END IF;

  PERFORM set_config('gsh.beneficiary_write', '1', true);
  UPDATE public.event_societies
     SET payment_beneficiary_society_id = p_payer_society_id
   WHERE event_id = p_event_id
     AND society_id = p_payer_society_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'event_society_not_found';
  END IF;
END;
$setben$;

COMMENT ON FUNCTION public.set_event_payment_beneficiary(uuid, uuid, uuid) IS
  'Captain or Treasurer may record that the payer society collects its own fee. Another society is refused. Checkout does not read this value.';

-- Clear destinations that point at a different society. The trigger allows
-- that clear without a session setting.
UPDATE public.event_societies
   SET payment_beneficiary_society_id = NULL
 WHERE payment_beneficiary_society_id IS NOT NULL
   AND payment_beneficiary_society_id IS DISTINCT FROM society_id;

DELETE FROM public.event_payment_beneficiary_routes
 WHERE beneficiary_society_id IS DISTINCT FROM payer_society_id;
