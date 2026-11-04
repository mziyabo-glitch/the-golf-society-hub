-- Society net may be the connected-account balance net when Stripe leaves
-- the card fee on the platform balance. That identity is application fee plus
-- society net equals the gross. The other identity, used when the connected
-- account bears both fees, is stripe fee plus application fee plus society net
-- equals the gross. The stripe fee is still the stripe_fee detail, never the estimate.

CREATE OR REPLACE FUNCTION public.record_event_stripe_processing_fee(
  p_payment_transaction_id uuid,
  p_stripe_payment_intent text,
  p_fee_pence integer,
  p_net_pence integer,
  p_application_fee_pence integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fee$
DECLARE
  v_tx public.payment_transactions%ROWTYPE;
  v_variance integer;
BEGIN
  IF p_stripe_payment_intent IS NULL OR length(trim(p_stripe_payment_intent)) = 0 THEN
    RAISE EXCEPTION 'payment_intent_missing';
  END IF;
  IF p_fee_pence IS NULL OR p_net_pence IS NULL OR p_application_fee_pence IS NULL
     OR p_fee_pence < 0 OR p_net_pence < 0 OR p_application_fee_pence < 0 THEN
    RAISE EXCEPTION 'payment_fee_missing';
  END IF;

  SELECT * INTO v_tx
    FROM public.payment_transactions
   WHERE id = p_payment_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_transaction_not_found';
  END IF;

  IF v_tx.status NOT IN ('succeeded', 'refund_pending', 'refunded') THEN
    RAISE EXCEPTION 'payment_not_recorded';
  END IF;

  IF v_tx.stripe_payment_intent_id IS DISTINCT FROM p_stripe_payment_intent THEN
    RAISE EXCEPTION 'payment_intent_mismatch';
  END IF;

  IF p_fee_pence + p_application_fee_pence + p_net_pence IS DISTINCT FROM v_tx.amount_pence
     AND p_application_fee_pence + p_net_pence IS DISTINCT FROM v_tx.amount_pence THEN
    RAISE EXCEPTION 'payment_fee_mismatch';
  END IF;

  IF v_tx.stripe_processing_fee_pence IS NOT NULL
     OR v_tx.stripe_net_pence IS NOT NULL
     OR v_tx.stripe_application_fee_pence IS NOT NULL THEN
    IF v_tx.stripe_processing_fee_pence = p_fee_pence
       AND v_tx.stripe_net_pence = p_net_pence
       AND v_tx.stripe_application_fee_pence = p_application_fee_pence THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'payment_fee_already_recorded';
  END IF;

  v_variance := CASE
    WHEN v_tx.processing_fee_mode = 'player_pays'
      THEN p_fee_pence - (v_tx.estimated_processing_fee_pence - v_tx.platform_fee_pence)
    ELSE NULL
  END;

  UPDATE public.payment_transactions
     SET stripe_processing_fee_pence = p_fee_pence,
         stripe_net_pence = p_net_pence,
         stripe_application_fee_pence = p_application_fee_pence,
         processing_fee_variance_pence = v_variance
   WHERE id = p_payment_transaction_id;
END;
$fee$;

REVOKE ALL ON FUNCTION public.record_event_stripe_processing_fee(uuid, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_stripe_processing_fee(uuid, text, integer, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.record_event_stripe_processing_fee(uuid, text, integer, integer, integer) IS
  'Stores the Stripe processing fee, the Stripe application fee, and the society net. service_role only. Does not accept an estimate.';

NOTIFY pgrst, 'reload schema';
