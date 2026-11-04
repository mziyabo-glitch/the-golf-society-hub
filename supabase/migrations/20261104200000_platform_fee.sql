-- Golf Society Hub platform fee.
-- Connect destination charges snapshot 200 basis points (2.00%) of the intended
-- event fee, rounded half-up to whole pence, and send that amount as
-- application_fee_amount. Staging platform-only charges snapshot 0 and send no
-- application fee. stripe_application_fee_pence is written only from Stripe.
-- stripe_net_pence is the society net: gross minus the Stripe processing fee
-- minus the application fee. A full refund uses refund_application_fee true.
-- stripe_application_fee_refunded_pence is Stripe ApplicationFee.amount_refunded,
-- not a fee invented on the refund.

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS platform_fee_basis_points integer,
  ADD COLUMN IF NOT EXISTS platform_fee_pence integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_application_fee_pence integer,
  ADD COLUMN IF NOT EXISTS stripe_application_fee_refunded_pence integer;

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_platform_fee_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_platform_fee_check
  CHECK (
    platform_fee_pence >= 0
    AND (platform_fee_basis_points IS NULL OR (platform_fee_basis_points >= 0 AND platform_fee_basis_points < 10000))
    AND (stripe_application_fee_pence IS NULL OR stripe_application_fee_pence >= 0)
    AND (stripe_application_fee_refunded_pence IS NULL OR stripe_application_fee_refunded_pence >= 0)
    AND (
      processing_fee_mode <> 'player_pays'
      OR estimated_processing_fee_pence >= platform_fee_pence
    )
  );

COMMENT ON COLUMN public.payment_transactions.platform_fee_basis_points IS
  'Snapshot of the platform fee rate in basis points. Null before this fee existed. 0 on a staging platform-only charge, which has no application fee.';
COMMENT ON COLUMN public.payment_transactions.platform_fee_pence IS
  'Snapshot of the platform fee in pence, from the intended event fee. 0 when no application fee was charged. Not the recorded Stripe application fee.';
COMMENT ON COLUMN public.payment_transactions.stripe_application_fee_pence IS
  'Actual application fee from the Stripe charge or its fee details. Null until Stripe supplies it. Never copied from the snapshot.';
COMMENT ON COLUMN public.payment_transactions.stripe_application_fee_refunded_pence IS
  'Amount of the application fee Stripe refunded. Null until ApplicationFee.amount_refunded is read. Not an invented refund fee.';
COMMENT ON COLUMN public.payment_transactions.stripe_net_pence IS
  'Society net in pence: gross minus the Stripe processing fee minus the application fee. Historical rows with no application fee keep the balance-transaction net.';

DROP FUNCTION IF EXISTS public.record_event_stripe_processing_fee(uuid, text, integer, integer);

CREATE FUNCTION public.record_event_stripe_processing_fee(
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

  IF p_fee_pence + p_application_fee_pence + p_net_pence IS DISTINCT FROM v_tx.amount_pence THEN
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

CREATE OR REPLACE FUNCTION public.record_event_stripe_application_fee_refund(
  p_payment_transaction_id uuid,
  p_refunded_pence integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $appref$
DECLARE
  v_tx public.payment_transactions%ROWTYPE;
BEGIN
  IF p_refunded_pence IS NULL OR p_refunded_pence < 0 THEN
    RAISE EXCEPTION 'application_fee_refund_missing';
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

  IF v_tx.stripe_application_fee_pence IS NOT NULL
     AND p_refunded_pence > v_tx.stripe_application_fee_pence THEN
    RAISE EXCEPTION 'application_fee_refund_mismatch';
  END IF;

  IF v_tx.stripe_application_fee_refunded_pence IS NOT NULL
     AND p_refunded_pence < v_tx.stripe_application_fee_refunded_pence THEN
    RAISE EXCEPTION 'application_fee_refund_already_recorded';
  END IF;

  IF v_tx.stripe_application_fee_refunded_pence IS NOT DISTINCT FROM p_refunded_pence THEN
    RETURN;
  END IF;

  UPDATE public.payment_transactions
     SET stripe_application_fee_refunded_pence = p_refunded_pence
   WHERE id = p_payment_transaction_id;
END;
$appref$;

REVOKE ALL ON FUNCTION public.record_event_stripe_application_fee_refund(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_stripe_application_fee_refund(uuid, integer)
  TO service_role;

COMMENT ON FUNCTION public.record_event_stripe_application_fee_refund(uuid, integer) IS
  'Stores ApplicationFee.amount_refunded. service_role only. Does not invent a refund fee.';

NOTIFY pgrst, 'reload schema';
