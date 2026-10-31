-- Lock Stripe Connect account ownership on societies.
-- Authenticated clients, including Captain and Treasurer, cannot write
-- stripe_connect_account_id or the Connect status flags. Service role sets
-- the account id only through assign_society_stripe_connect_account, and only
-- for a society that does not already have a different account. One acct_
-- cannot be stored on two societies.
-- Do not apply this file to production project eaenzjwecrrbhibrvgsb from a
-- local staging session.

CREATE UNIQUE INDEX IF NOT EXISTS societies_stripe_connect_account_id_uq
  ON public.societies (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

COMMENT ON COLUMN public.societies.stripe_connect_account_id IS
  'Stripe Connect account for this society only. Service role may set it during onboarding. Clients cannot. Unique across societies.';

CREATE OR REPLACE FUNCTION public.guard_society_stripe_connect_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $guard$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.stripe_connect_account_id IS NOT DISTINCT FROM OLD.stripe_connect_account_id
     AND NEW.stripe_connect_charges_enabled IS NOT DISTINCT FROM OLD.stripe_connect_charges_enabled
     AND NEW.stripe_connect_details_submitted IS NOT DISTINCT FROM OLD.stripe_connect_details_submitted THEN
    RETURN NEW;
  END IF;

  NEW.stripe_connect_account_id := NULLIF(btrim(coalesce(NEW.stripe_connect_account_id, '')), '');

  IF public.payment_mutation_from_end_user() THEN
    IF TG_OP = 'INSERT'
       AND NEW.stripe_connect_account_id IS NULL
       AND NEW.stripe_connect_charges_enabled IS NOT TRUE
       AND NEW.stripe_connect_details_submitted IS NOT TRUE THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'stripe_connect_ownership_locked'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.stripe_connect_account_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.societies s
        WHERE s.stripe_connect_account_id = NEW.stripe_connect_account_id
          AND s.id IS DISTINCT FROM NEW.id
     ) THEN
    RAISE EXCEPTION 'stripe_connect_account_already_bound'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$guard$;

REVOKE ALL ON FUNCTION public.guard_society_stripe_connect_ownership() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_society_stripe_connect_ownership() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_society_stripe_connect_ownership ON public.societies;
CREATE TRIGGER trg_guard_society_stripe_connect_ownership
  BEFORE INSERT OR UPDATE ON public.societies
  FOR EACH ROW EXECUTE FUNCTION public.guard_society_stripe_connect_ownership();

-- Table-level UPDATE still covers every column. Replace it with column
-- grants that omit the Connect ownership fields. service_role keeps them
-- so the webhook can sync charges_enabled. The account id itself is assigned
-- by the function below.
REVOKE INSERT, UPDATE ON TABLE public.societies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.societies TO service_role;

DO $cols$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'societies'
     AND column_name NOT IN (
       'stripe_connect_account_id',
       'stripe_connect_charges_enabled',
       'stripe_connect_details_submitted'
     );
  IF v_cols IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.societies TO authenticated', v_cols);
    EXECUTE format('GRANT INSERT (%s) ON TABLE public.societies TO authenticated', v_cols);
  END IF;
END
$cols$;

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
   WHERE id = p_society_id
     AND (
       stripe_connect_account_id IS NULL
       OR stripe_connect_account_id = v_account
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    IF NOT EXISTS (SELECT 1 FROM public.societies s WHERE s.id = p_society_id) THEN
      RAISE EXCEPTION 'stripe_connect_account_society_missing'
        USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'stripe_connect_account_society_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'stripe_connect_account_already_bound'
      USING ERRCODE = '23505';
END;
$assign$;

REVOKE ALL ON FUNCTION public.assign_society_stripe_connect_account(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_society_stripe_connect_account(uuid, text) TO service_role;

COMMENT ON FUNCTION public.assign_society_stripe_connect_account(uuid, text) IS
  'Service role only. Binds a new Connect account to the society that just onboarded. Refuses an account id already stored on a different society.';
