-- Let service role replace a society's own Connect account.
-- Apply after 20261104140000_joint_payments_stay_with_payer_society.sql.
-- This file was not applied to production eaenzjwecrrbhibrvgsb.
-- An acct_ already stored on a different society is still refused.
-- Authenticated users still cannot execute this function or update the column.

CREATE OR REPLACE FUNCTION public.assign_society_stripe_connect_account(
  p_society_id uuid,
  p_account_id text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $assign$
DECLARE
  v_account text := NULLIF(btrim(coalesce(p_account_id, '')), '');
  v_updated integer := 0;
BEGIN
  IF public.payment_mutation_from_end_user() THEN
    RAISE EXCEPTION 'stripe_connect_ownership_locked'
      USING ERRCODE = '42501';
  END IF;
  IF p_society_id IS NULL OR v_account IS NULL THEN
    RAISE EXCEPTION 'stripe_connect_account_required'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.societies s
     WHERE s.stripe_connect_account_id = v_account
       AND s.id IS DISTINCT FROM p_society_id
  ) THEN
    RAISE EXCEPTION 'stripe_connect_account_already_bound'
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.societies
     SET stripe_connect_account_id = v_account
   WHERE id = p_society_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'stripe_connect_account_society_missing'
      USING ERRCODE = 'P0002';
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'stripe_connect_account_already_bound'
      USING ERRCODE = '23505';
END;
$assign$;

COMMENT ON FUNCTION public.assign_society_stripe_connect_account(uuid, text) IS
  'Service role only. Binds a Connect account to one society and may replace that society''s own stored id. Refuses an acct_ already stored on another society.';
