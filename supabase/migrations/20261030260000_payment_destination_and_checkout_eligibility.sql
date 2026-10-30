-- Payment destination and checkout eligibility.
-- Apply after 20261030250000_guest_payment_invitations.sql.
-- Fresh databases: foundation, then integrity repair, then guest invitations, then this file.
-- Production project eaenzjwecrrbhibrvgsb already has the draft foundation.
-- Do not re-apply the foundation file there. This migration is the next step
-- after the repair and guest invitation files, and it must not be run here.

-- ---------------------------------------------------------------------------
-- Remember an authorised beneficiary across ManCo delete-and-insert saves.
-- Authenticated roles cannot write this table. Checkout still reads
-- event_societies.payment_beneficiary_society_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_payment_beneficiary_routes (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  payer_society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  beneficiary_society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, payer_society_id)
);

ALTER TABLE public.event_payment_beneficiary_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_payment_beneficiary_routes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_payment_beneficiary_routes TO service_role;

COMMENT ON TABLE public.event_payment_beneficiary_routes IS
  'Authorised Stripe Connect destination per participating society. Restored when event_societies is rewritten.';

-- ---------------------------------------------------------------------------
-- Captain or Treasurer only. Secretary, Handicapper, and ordinary members
-- cannot change it. The beneficiary must host or play in the event.
-- Column privileges block authenticated writes. The trigger also blocks
-- service_role and any later grant that includes the column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_event_payment_beneficiary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $guard$
DECLARE
  v_authorised boolean := coalesce(current_setting('gsh.beneficiary_write', true), '') = '1';
  v_host uuid;
  v_preserved uuid;
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
     AND NOT EXISTS (
       SELECT 1 FROM public.societies s WHERE s.id = OLD.payment_beneficiary_society_id
     ) THEN
    DELETE FROM public.event_payment_beneficiary_routes r
     WHERE r.event_id = NEW.event_id
       AND r.payer_society_id = NEW.society_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.payment_beneficiary_society_id IS NULL AND NOT v_authorised THEN
    SELECT r.beneficiary_society_id
      INTO v_preserved
      FROM public.event_payment_beneficiary_routes r
     WHERE r.event_id = NEW.event_id
       AND r.payer_society_id = NEW.society_id;
    IF v_preserved IS NOT NULL THEN
      NEW.payment_beneficiary_society_id := v_preserved;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT v_authorised THEN
    RAISE EXCEPTION 'payment_beneficiary_unauthorised';
  END IF;

  SELECT e.society_id INTO v_host FROM public.events e WHERE e.id = NEW.event_id;
  IF NEW.payment_beneficiary_society_id IS NOT NULL
     AND NEW.payment_beneficiary_society_id IS DISTINCT FROM v_host
     AND NEW.payment_beneficiary_society_id IS DISTINCT FROM NEW.society_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.event_societies es
        WHERE es.event_id = NEW.event_id
          AND es.society_id = NEW.payment_beneficiary_society_id
     ) THEN
    RAISE EXCEPTION 'payment_beneficiary_not_on_event';
  END IF;

  IF NEW.payment_beneficiary_society_id IS NULL THEN
    DELETE FROM public.event_payment_beneficiary_routes r
     WHERE r.event_id = NEW.event_id
       AND r.payer_society_id = NEW.society_id;
  ELSE
    INSERT INTO public.event_payment_beneficiary_routes (event_id, payer_society_id, beneficiary_society_id, updated_at)
    VALUES (NEW.event_id, NEW.society_id, NEW.payment_beneficiary_society_id, now())
    ON CONFLICT (event_id, payer_society_id) DO UPDATE
      SET beneficiary_society_id = EXCLUDED.beneficiary_society_id,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$guard$;

REVOKE ALL ON FUNCTION public.guard_event_payment_beneficiary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_event_payment_beneficiary() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_event_payment_beneficiary ON public.event_societies;
CREATE TRIGGER trg_guard_event_payment_beneficiary
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_societies
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_payment_beneficiary();

-- Table-level UPDATE would still cover every column, so replace it with
-- grants that omit payment_beneficiary_society_id.
REVOKE INSERT, UPDATE ON TABLE public.event_societies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_societies TO service_role;

DO $cols$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'event_societies'
     AND column_name <> 'payment_beneficiary_society_id';
  IF v_cols IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.event_societies TO authenticated', v_cols);
    EXECUTE format('GRANT INSERT (%s) ON TABLE public.event_societies TO authenticated', v_cols);
  END IF;
END
$cols$;

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

  IF p_payer_society_id IS DISTINCT FROM v_host
     AND NOT EXISTS (
       SELECT 1
         FROM public.event_societies es
        WHERE es.event_id = p_event_id
          AND es.society_id = p_payer_society_id
     ) THEN
    RAISE EXCEPTION 'payment_beneficiary_not_on_event';
  END IF;

  IF p_beneficiary_society_id IS NOT NULL
     AND p_beneficiary_society_id IS DISTINCT FROM v_host
     AND NOT EXISTS (
       SELECT 1
         FROM public.event_societies es
        WHERE es.event_id = p_event_id
          AND es.society_id = p_beneficiary_society_id
     ) THEN
    RAISE EXCEPTION 'payment_beneficiary_not_on_event';
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

  PERFORM set_config('gsh.beneficiary_write', '1', true);
  UPDATE public.event_societies
     SET payment_beneficiary_society_id = p_beneficiary_society_id
   WHERE event_id = p_event_id
     AND society_id = p_payer_society_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'event_society_not_found';
  END IF;
END;
$setben$;

REVOKE ALL ON FUNCTION public.set_event_payment_beneficiary(uuid, uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_event_payment_beneficiary(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.set_event_payment_beneficiary(uuid, uuid, uuid) IS
  'Captain or Treasurer of the host or payer society sets the Connect destination. The beneficiary must be on the event.';

-- ---------------------------------------------------------------------------
-- Webhook apply. A missing registration is inserted only for a player who is
-- already on events.player_ids or an active joint event_entries row.
-- Everyone else is recorded on the ledger with resolution_required and is
-- not added to the playing list. Manual mark_event_paid is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_event_stripe_payment(
  p_payment_transaction_id uuid,
  p_stripe_event_id text,
  p_stripe_session_id text,
  p_stripe_payment_intent text,
  p_amount_pence integer,
  p_currency text,
  p_connect_account_id text,
  p_event_id uuid,
  p_beneficiary_society_id uuid,
  p_receipt_url text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $apply$
DECLARE
  v_tx public.payment_transactions%ROWTYPE;
  v_reg_status text;
  v_removed timestamptz;
  v_hold boolean := false;
  v_rows integer := 0;
  v_connect text;
  v_on_roster boolean := false;
BEGIN
  IF p_stripe_event_id IS NULL OR length(trim(p_stripe_event_id)) = 0 THEN
    RAISE EXCEPTION 'payment_event_id_missing';
  END IF;
  IF p_stripe_session_id IS NULL OR length(trim(p_stripe_session_id)) = 0 THEN
    RAISE EXCEPTION 'payment_session_missing';
  END IF;
  IF p_stripe_payment_intent IS NULL OR length(trim(p_stripe_payment_intent)) = 0 THEN
    RAISE EXCEPTION 'payment_intent_missing';
  END IF;

  SELECT * INTO v_tx
    FROM public.payment_transactions
   WHERE id = p_payment_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_transaction_not_found';
  END IF;

  IF v_tx.status = 'succeeded' THEN
    IF v_tx.stripe_event_id IS NOT DISTINCT FROM p_stripe_event_id
       AND v_tx.stripe_payment_intent_id IS NOT DISTINCT FROM p_stripe_payment_intent THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'payment_already_applied';
  END IF;

  IF v_tx.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_payable';
  END IF;

  IF p_amount_pence IS DISTINCT FROM v_tx.amount_pence OR p_amount_pence <= 0 THEN
    RAISE EXCEPTION 'payment_amount_mismatch';
  END IF;

  IF lower(trim(coalesce(p_currency, ''))) <> 'gbp' OR v_tx.currency <> 'gbp' THEN
    RAISE EXCEPTION 'payment_currency_mismatch';
  END IF;

  IF v_tx.event_id IS DISTINCT FROM p_event_id OR v_tx.event_id IS NULL THEN
    RAISE EXCEPTION 'payment_event_mismatch';
  END IF;

  IF v_tx.beneficiary_society_id IS DISTINCT FROM p_beneficiary_society_id
     OR v_tx.beneficiary_society_id IS NULL THEN
    RAISE EXCEPTION 'payment_beneficiary_mismatch';
  END IF;

  IF v_tx.stripe_checkout_session_id IS NOT NULL
     AND v_tx.stripe_checkout_session_id IS DISTINCT FROM p_stripe_session_id THEN
    RAISE EXCEPTION 'payment_session_mismatch';
  END IF;

  IF v_tx.stripe_payment_intent_id IS NOT NULL
     AND v_tx.stripe_payment_intent_id IS DISTINCT FROM p_stripe_payment_intent THEN
    RAISE EXCEPTION 'payment_intent_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.payment_transactions other
     WHERE other.stripe_payment_intent_id = p_stripe_payment_intent
       AND other.id <> p_payment_transaction_id
  ) THEN
    RAISE EXCEPTION 'payment_intent_already_used';
  END IF;

  SELECT s.stripe_connect_account_id
    INTO v_connect
    FROM public.societies s
   WHERE s.id = v_tx.beneficiary_society_id;

  IF v_connect IS NULL
     OR v_connect IS DISTINCT FROM p_connect_account_id
     OR v_tx.stripe_connect_account_id IS DISTINCT FROM p_connect_account_id THEN
    RAISE EXCEPTION 'payment_connect_account_mismatch';
  END IF;

  IF v_tx.payer_type = 'member' THEN
    IF v_tx.member_id IS NULL THEN
      RAISE EXCEPTION 'payment_target_missing';
    END IF;

    SELECT r.status, r.removed_from_event_at
      INTO v_reg_status, v_removed
      FROM public.event_registrations r
     WHERE r.event_id = v_tx.event_id
       AND r.member_id = v_tx.member_id
     FOR UPDATE;

    IF FOUND THEN
      v_hold := v_removed IS NOT NULL OR v_reg_status IS DISTINCT FROM 'in';
      UPDATE public.event_registrations r
         SET paid = true,
             amount_paid_pence = p_amount_pence,
             paid_at = now(),
             payment_method = 'stripe',
             payment_transaction_id = v_tx.id,
             stripe_checkout_session_id = p_stripe_session_id,
             payment_resolution_required = v_hold
       WHERE r.event_id = v_tx.event_id
         AND r.member_id = v_tx.member_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'payment_target_missing';
      END IF;
    ELSE
      SELECT v_tx.member_id = ANY (coalesce(e.player_ids, '{}'::uuid[]))
        INTO v_on_roster
        FROM public.events e
       WHERE e.id = v_tx.event_id;

      IF NOT coalesce(v_on_roster, false) AND to_regclass('public.event_entries') IS NOT NULL THEN
        EXECUTE $roster$
          SELECT EXISTS (
            SELECT 1
              FROM public.event_entries ee
             WHERE ee.event_id = $1
               AND ee.player_id = $2
               AND ee.status IN ('confirmed', 'pending')
          )
        $roster$
          INTO v_on_roster
          USING v_tx.event_id, v_tx.member_id;
      END IF;

      IF coalesce(v_on_roster, false) AND v_tx.society_id IS NOT NULL THEN
        INSERT INTO public.event_registrations (
          society_id, event_id, member_id, status, paid, amount_paid_pence, paid_at,
          payment_method, payment_transaction_id, stripe_checkout_session_id,
          payment_resolution_required
        ) VALUES (
          v_tx.society_id, v_tx.event_id, v_tx.member_id, 'in', true, p_amount_pence, now(),
          'stripe', v_tx.id, p_stripe_session_id, false
        );
        v_hold := false;
      ELSE
        v_hold := true;
      END IF;
    END IF;
  ELSIF v_tx.payer_type = 'guest' THEN
    IF v_tx.guest_id IS NULL THEN
      RAISE EXCEPTION 'payment_target_missing';
    END IF;

    UPDATE public.event_guests g
       SET paid = true,
           amount_paid_pence = p_amount_pence,
           payment_method = 'stripe',
           payment_transaction_id = v_tx.id,
           stripe_checkout_session_id = p_stripe_session_id,
           payment_resolution_required = false
     WHERE g.id = v_tx.guest_id
       AND g.event_id = v_tx.event_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'payment_target_missing';
    END IF;
    v_hold := false;
  ELSE
    RAISE EXCEPTION 'payment_payer_invalid';
  END IF;

  UPDATE public.payment_transactions
     SET status = 'succeeded',
         stripe_event_id = p_stripe_event_id,
         stripe_checkout_session_id = p_stripe_session_id,
         stripe_payment_intent_id = p_stripe_payment_intent,
         stripe_receipt_url = nullif(trim(coalesce(p_receipt_url, '')), ''),
         resolution_required = v_hold,
         completed_at = now(),
         payment_method = 'stripe',
         failure_reason = NULL
   WHERE id = p_payment_transaction_id;
END;
$apply$;

REVOKE ALL ON FUNCTION public.apply_event_stripe_payment(uuid, text, text, text, integer, text, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_event_stripe_payment(uuid, text, text, text, integer, text, text, uuid, uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
