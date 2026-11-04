-- Staging platform charges.
-- A blank Connect id on both the apply argument and the ledger row is a
-- direct platform charge. The society row may still store an account id.
-- If either side has an id, payment_connect_account_mismatch still applies.
-- Guest invitations stay unpaid unless Connect can take charges, unless the
-- database setting gsh.staging_platform_only_payments is exactly true or the
-- local switch below is enabled. This migration leaves both off.

CREATE TABLE IF NOT EXISTS public.staging_platform_payment_switch (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false
);

INSERT INTO public.staging_platform_payment_switch (id, enabled)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.staging_platform_payment_switch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staging_platform_payment_switch FROM PUBLIC, anon, authenticated;

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

  IF NOT (
       length(trim(coalesce(p_connect_account_id, ''))) = 0
       AND length(trim(coalesce(v_tx.stripe_connect_account_id, ''))) = 0
     )
     AND (
       v_connect IS NULL
       OR v_connect IS DISTINCT FROM p_connect_account_id
       OR v_tx.stripe_connect_account_id IS DISTINCT FROM p_connect_account_id
     ) THEN
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


CREATE OR REPLACE FUNCTION public.submit_public_guest_rsvp_with_payment_token(
  p_event_id uuid,
  p_name text
) RETURNS TABLE (
  guest_id uuid,
  society_id uuid,
  payment_token text,
  amount_pence integer,
  online_payments_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $guest$
DECLARE
  v_host uuid;
  v_clean text := trim(coalesce(p_name, ''));
  v_guest uuid;
  v_deadline timestamptz;
  v_date text;
  v_fee integer;
  v_enabled boolean := false;
  v_charges boolean := false;
  v_account text;
  v_token text;
  v_hash text;
  v_expires timestamptz := now() + interval '14 days';
  v_event_end timestamptz;
  v_payable boolean := false;
BEGIN
  IF p_event_id IS NULL THEN RAISE EXCEPTION 'Missing event id'; END IF;
  IF length(v_clean) < 2 THEN RAISE EXCEPTION 'Please enter your name'; END IF;

  SELECT e.society_id, e.rsvp_deadline_at, e.date::text, e.guest_entry_fee_pence
    INTO v_host, v_deadline, v_date, v_fee
    FROM public.events e
   WHERE e.id = p_event_id;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_deadline IS NOT NULL AND now() > v_deadline THEN
    RAISE EXCEPTION 'rsvp_closed';
  END IF;

  INSERT INTO public.event_guests (society_id, event_id, name, sex)
  VALUES (v_host, p_event_id, v_clean, NULL)
  RETURNING id INTO v_guest;

  SELECT s.online_payments_enabled, s.stripe_connect_charges_enabled, s.stripe_connect_account_id
    INTO v_enabled, v_charges, v_account
    FROM public.societies s
   WHERE s.id = v_host;

  IF v_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
    BEGIN
      v_event_end := (substring(v_date from 1 for 10)::date + 2)::timestamptz + interval '23 hours 59 minutes 59 seconds';
      IF v_event_end > now() THEN
        v_expires := least(v_expires, v_event_end);
      ELSE
        v_expires := now();
      END IF;
    EXCEPTION WHEN others THEN
      v_expires := now() + interval '14 days';
    END;
  END IF;

  v_payable := coalesce(v_enabled, false)
    AND (
      (
        coalesce(v_charges, false)
        AND length(trim(coalesce(v_account, ''))) > 0
      )
      OR current_setting('gsh.staging_platform_only_payments', true) = 'true'
      OR EXISTS (
        SELECT 1
          FROM public.staging_platform_payment_switch s
         WHERE s.enabled
      )
    )
    AND coalesce(v_fee, 0) > 0
    AND v_expires > now();

  IF v_payable THEN
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    v_hash := encode(digest(v_token, 'sha256'), 'hex');
    INSERT INTO public.event_guest_payment_invitations (
      guest_id, event_id, society_id, token_hash, expires_at
    ) VALUES (
      v_guest, p_event_id, v_host, v_hash, v_expires
    );
  END IF;

  guest_id := v_guest;
  society_id := v_host;
  payment_token := v_token;
  amount_pence := CASE WHEN v_payable THEN v_fee ELSE 0 END;
  online_payments_enabled := coalesce(v_enabled, false);
  RETURN NEXT;
END;
$guest$;

REVOKE ALL ON FUNCTION public.submit_public_guest_rsvp_with_payment_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_guest_rsvp_with_payment_token(uuid, text) TO anon, authenticated;


NOTIFY pgrst, 'reload schema';
