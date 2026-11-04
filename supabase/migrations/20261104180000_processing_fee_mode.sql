-- Processing fees.
-- society_absorbs is the default: Checkout charges the event fee exactly.
-- player_pays adds a grossed-up processing line. The payment row snapshots the
-- mode and the estimate. stripe_processing_fee_pence is written only from a
-- Stripe balance transaction, never from that estimate.

ALTER TABLE public.societies
  ADD COLUMN IF NOT EXISTS processing_fee_mode text NOT NULL DEFAULT 'society_absorbs';

ALTER TABLE public.societies
  DROP CONSTRAINT IF EXISTS societies_processing_fee_mode_check;

ALTER TABLE public.societies
  ADD CONSTRAINT societies_processing_fee_mode_check
  CHECK (processing_fee_mode IN ('society_absorbs', 'player_pays'));

COMMENT ON COLUMN public.societies.processing_fee_mode IS
  'society_absorbs charges the event fee exactly. player_pays adds a processing-fee line. Default society_absorbs.';

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS processing_fee_mode text NOT NULL DEFAULT 'society_absorbs',
  ADD COLUMN IF NOT EXISTS intended_fee_pence integer,
  ADD COLUMN IF NOT EXISTS estimated_processing_fee_pence integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_processing_fee_pence integer,
  ADD COLUMN IF NOT EXISTS stripe_net_pence integer,
  ADD COLUMN IF NOT EXISTS processing_fee_variance_pence integer;

UPDATE public.payment_transactions
   SET intended_fee_pence = amount_pence
 WHERE intended_fee_pence IS NULL;

ALTER TABLE public.payment_transactions
  ALTER COLUMN intended_fee_pence SET NOT NULL;

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_processing_fee_mode_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_processing_fee_mode_check
  CHECK (processing_fee_mode IN ('society_absorbs', 'player_pays'));

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_processing_fee_amounts_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_processing_fee_amounts_check
  CHECK (
    intended_fee_pence > 0
    AND estimated_processing_fee_pence >= 0
    AND (
      (
        processing_fee_mode = 'society_absorbs'
        AND estimated_processing_fee_pence = 0
        AND amount_pence = intended_fee_pence
      )
      OR (
        processing_fee_mode = 'player_pays'
        AND amount_pence = intended_fee_pence + estimated_processing_fee_pence
      )
    )
  );

COMMENT ON COLUMN public.payment_transactions.processing_fee_mode IS
  'Snapshot of the payer society mode when the Checkout row was created.';
COMMENT ON COLUMN public.payment_transactions.intended_fee_pence IS
  'Event fee the society meant to collect, before any player-paid processing line.';
COMMENT ON COLUMN public.payment_transactions.estimated_processing_fee_pence IS
  'Quoted processing line. Zero when the society absorbs fees. Not the recorded Stripe fee.';
COMMENT ON COLUMN public.payment_transactions.stripe_processing_fee_pence IS
  'Actual fee from the Stripe balance transaction. Null until that transaction is supplied.';
COMMENT ON COLUMN public.payment_transactions.stripe_net_pence IS
  'Actual net from the same Stripe balance transaction.';
COMMENT ON COLUMN public.payment_transactions.processing_fee_variance_pence IS
  'Player-pays only: actual fee minus the estimated line. Null for society_absorbs and until the actual fee exists.';

CREATE OR REPLACE FUNCTION public.record_event_stripe_processing_fee(
  p_payment_transaction_id uuid,
  p_stripe_payment_intent text,
  p_fee_pence integer,
  p_net_pence integer
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
  IF p_fee_pence IS NULL OR p_net_pence IS NULL OR p_fee_pence < 0 OR p_net_pence < 0 THEN
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

  IF p_fee_pence + p_net_pence IS DISTINCT FROM v_tx.amount_pence THEN
    RAISE EXCEPTION 'payment_fee_mismatch';
  END IF;

  IF v_tx.stripe_processing_fee_pence IS NOT NULL OR v_tx.stripe_net_pence IS NOT NULL THEN
    IF v_tx.stripe_processing_fee_pence = p_fee_pence AND v_tx.stripe_net_pence = p_net_pence THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'payment_fee_already_recorded';
  END IF;

  v_variance := CASE
    WHEN v_tx.processing_fee_mode = 'player_pays' THEN p_fee_pence - v_tx.estimated_processing_fee_pence
    ELSE NULL
  END;

  UPDATE public.payment_transactions
     SET stripe_processing_fee_pence = p_fee_pence,
         stripe_net_pence = p_net_pence,
         processing_fee_variance_pence = v_variance
   WHERE id = p_payment_transaction_id;
END;
$fee$;

REVOKE ALL ON FUNCTION public.record_event_stripe_processing_fee(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_stripe_processing_fee(uuid, text, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.record_event_stripe_processing_fee(uuid, text, integer, integer) IS
  'Stores the Stripe balance-transaction fee and net. service_role only. Does not accept an estimate.';
