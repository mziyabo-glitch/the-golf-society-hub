-- Stripe event payments foundation: pricing pence, payment_transactions, Connect fields,
-- payment column guards, webhook RPC apply_event_stripe_payment.

-- ---------------------------------------------------------------------------
-- Societies: Connect + feature flag + manual bank copy
-- ---------------------------------------------------------------------------
ALTER TABLE public.societies
  ADD COLUMN IF NOT EXISTS online_payments_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text NULL,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_bank_transfer_instructions text NULL;

COMMENT ON COLUMN public.societies.online_payments_enabled IS
  'When true and Connect is ready, members may pay event fees via Stripe Checkout (test/live per platform keys).';
COMMENT ON COLUMN public.societies.event_bank_transfer_instructions IS
  'Optional manual payment instructions shown alongside Pay now.';

-- ---------------------------------------------------------------------------
-- Events: structured entry fees (pence). Display string retained for legacy UI.
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS member_entry_fee_pence integer NULL
    CHECK (member_entry_fee_pence IS NULL OR member_entry_fee_pence >= 0),
  ADD COLUMN IF NOT EXISTS guest_entry_fee_pence integer NULL
    CHECK (guest_entry_fee_pence IS NULL OR guest_entry_fee_pence >= 0),
  ADD COLUMN IF NOT EXISTS joint_participant_entry_fee_pence integer NULL
    CHECK (joint_participant_entry_fee_pence IS NULL OR joint_participant_entry_fee_pence >= 0);

COMMENT ON COLUMN public.events.member_entry_fee_pence IS 'Member entry fee in integer pence (GBP). Source of truth for Checkout when online payments enabled.';

-- ---------------------------------------------------------------------------
-- Joint: optional Connect payout beneficiary per participating society link
-- ---------------------------------------------------------------------------
ALTER TABLE public.event_societies
  ADD COLUMN IF NOT EXISTS payment_beneficiary_society_id uuid NULL
    REFERENCES public.societies(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.event_societies.payment_beneficiary_society_id IS
  'When set, Stripe Connect destination for this society''s event fees on joint events; else host society Connect account.';

-- ---------------------------------------------------------------------------
-- payment_transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id                  uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  beneficiary_society_id      uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  event_id                    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  payer_type                  text NOT NULL CHECK (payer_type IN ('member', 'guest')),
  member_id                   uuid NULL REFERENCES public.members(id) ON DELETE SET NULL,
  guest_id                    uuid NULL REFERENCES public.event_guests(id) ON DELETE SET NULL,
  amount_pence                integer NOT NULL CHECK (amount_pence > 0),
  currency                    text NOT NULL DEFAULT 'gbp' CHECK (char_length(currency) = 3),
  status                      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled', 'refunded')),
  payment_method              text NOT NULL DEFAULT 'stripe'
    CHECK (payment_method IN ('stripe', 'manual', 'bank_transfer')),
  idempotency_key             text NOT NULL,
  stripe_checkout_session_id  text NULL,
  stripe_payment_intent_id    text NULL,
  stripe_event_id             text NULL,
  failure_reason              text NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  completed_at                timestamptz NULL,
  CONSTRAINT payment_transactions_idempotency_key_uq UNIQUE (idempotency_key),
  CONSTRAINT payment_transactions_stripe_event_id_uq UNIQUE (stripe_event_id),
  CONSTRAINT payment_transactions_checkout_session_uq UNIQUE (stripe_checkout_session_id),
  CONSTRAINT payment_transactions_payer_check CHECK (
    (payer_type = 'member' AND member_id IS NOT NULL AND guest_id IS NULL)
    OR (payer_type = 'guest' AND guest_id IS NOT NULL AND member_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_event
  ON public.payment_transactions (event_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_society
  ON public.payment_transactions (society_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_payment_transactions_updated_at ON public.payment_transactions;
CREATE TRIGGER trg_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_transactions_select_manco ON public.payment_transactions;
CREATE POLICY payment_transactions_select_manco
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid()
      AND m.society_id = payment_transactions.society_id
      AND upper(coalesce(m.role, '')) IN ('CAPTAIN', 'TREASURER', 'SECRETARY')
  ));

DROP POLICY IF EXISTS payment_transactions_select_self ON public.payment_transactions;
CREATE POLICY payment_transactions_select_self
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (
    payer_type = 'member'
    AND member_id IN (
      SELECT m.id FROM public.members m WHERE m.user_id = auth.uid()
    )
  );

-- Inserts/updates from clients forbidden; service role + RPC only.

-- ---------------------------------------------------------------------------
-- Registration / guest payment metadata
-- ---------------------------------------------------------------------------
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS payment_method text NULL
    CHECK (payment_method IS NULL OR payment_method IN ('stripe', 'manual', 'bank_transfer')),
  ADD COLUMN IF NOT EXISTS payment_transaction_id uuid NULL
    REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text NULL;

ALTER TABLE public.event_guests
  ADD COLUMN IF NOT EXISTS payment_method text NULL
    CHECK (payment_method IS NULL OR payment_method IN ('stripe', 'manual', 'bank_transfer')),
  ADD COLUMN IF NOT EXISTS payment_transaction_id uuid NULL
    REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text NULL,
  ADD COLUMN IF NOT EXISTS amount_paid_pence integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Guard: block direct client writes to payment columns on event_registrations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_event_registration_payment_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $g$
BEGIN
  IF coalesce(current_setting('gsh.payment_write', true), '') = 'true' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.paid IS TRUE
       OR coalesce(NEW.amount_paid_pence, 0) <> 0
       OR NEW.paid_at IS NOT NULL
       OR NEW.payment_method IS NOT NULL
       OR NEW.payment_transaction_id IS NOT NULL
       OR NEW.stripe_checkout_session_id IS NOT NULL THEN
      RAISE EXCEPTION 'event_registration_payment_forbidden'
        USING HINT = 'Payment fields are updated via Treasurer tools or Stripe webhook only.';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.paid IS DISTINCT FROM OLD.paid
       OR NEW.amount_paid_pence IS DISTINCT FROM OLD.amount_paid_pence
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.marked_by_member_id IS DISTINCT FROM OLD.marked_by_member_id
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.payment_transaction_id IS DISTINCT FROM OLD.payment_transaction_id
       OR NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id THEN
      RAISE EXCEPTION 'event_registration_payment_forbidden'
        USING HINT = 'Payment fields are updated via Treasurer tools or Stripe webhook only.';
    END IF;
  END IF;

  RETURN NEW;
END;
$g$;

DROP TRIGGER IF EXISTS trg_event_reg_guard_payment ON public.event_registrations;
CREATE TRIGGER trg_event_reg_guard_payment
  BEFORE INSERT OR UPDATE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_registration_payment_columns();

-- ---------------------------------------------------------------------------
-- mark_event_paid: allow payment writes + set payment_method manual
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_event_paid(
  p_event_id           uuid,
  p_society_id         uuid,
  p_target_member_id   uuid,
  p_paid               boolean,
  p_amount_pence       integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_uid               uuid := auth.uid();
  v_host_society_id   uuid;
  v_event_allows      boolean;
  v_caller_id         uuid;
  v_caller_role       text;
  v_target_member     uuid;
  v_reg_society_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM set_config('gsh.payment_write', 'true', true);

  SELECT e.society_id
    INTO v_host_society_id
    FROM public.events e
   WHERE e.id = p_event_id;
  IF v_host_society_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  v_event_allows :=
    p_society_id = v_host_society_id
    OR EXISTS (
      SELECT 1
        FROM public.event_societies es
       WHERE es.event_id = p_event_id
         AND es.society_id = p_society_id
    );
  IF NOT v_event_allows THEN
    RAISE EXCEPTION 'This society is not part of this event';
  END IF;

  SELECT m.id, m.role
    INTO v_caller_id, v_caller_role
    FROM public.members m
   WHERE m.user_id = v_uid
     AND m.society_id = p_society_id
   LIMIT 1;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'No membership in this society — switch the active society in the app to manage payments for this club.';
  END IF;

  IF upper(coalesce(v_caller_role, '')) NOT IN ('CAPTAIN', 'TREASURER', 'SECRETARY', 'HANDICAPPER') THEN
    RAISE EXCEPTION 'Only Captain, Treasurer, Secretary, or Handicapper can mark payments';
  END IF;

  SELECT m.id, m.society_id
    INTO v_target_member, v_reg_society_id
    FROM public.members m
   WHERE m.id = p_target_member_id
     AND m.society_id = p_society_id
   LIMIT 1;

  IF v_target_member IS NULL OR v_reg_society_id IS NULL THEN
    RAISE EXCEPTION 'Member not found for this society — you can only record payments for your society''s members.';
  END IF;

  INSERT INTO public.event_registrations
    (society_id, event_id, member_id, status, paid, amount_paid_pence, paid_at, marked_by_member_id, payment_method)
  VALUES
    (v_reg_society_id, p_event_id, v_target_member, 'in',
     p_paid,
     CASE WHEN p_paid THEN coalesce(p_amount_pence, 0) ELSE 0 END,
     CASE WHEN p_paid THEN now() ELSE null END,
     v_caller_id,
     CASE WHEN p_paid THEN 'manual' ELSE NULL END)
  ON CONFLICT (event_id, member_id) DO UPDATE
    SET paid                = EXCLUDED.paid,
        amount_paid_pence   = EXCLUDED.amount_paid_pence,
        paid_at             = EXCLUDED.paid_at,
        marked_by_member_id = EXCLUDED.marked_by_member_id,
        payment_method      = CASE WHEN EXCLUDED.paid THEN 'manual' ELSE NULL END,
        status              = CASE WHEN EXCLUDED.paid THEN 'in' ELSE public.event_registrations.status END,
        removed_from_event_at = NULL,
        removed_by_member_id  = NULL;
END;
$f$;

-- ---------------------------------------------------------------------------
-- apply_event_stripe_payment — service role / webhook (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_event_stripe_payment(
  p_payment_transaction_id uuid,
  p_stripe_event_id        text,
  p_stripe_session_id      text,
  p_stripe_payment_intent  text,
  p_amount_pence           integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $w$
DECLARE
  v_tx public.payment_transactions%ROWTYPE;
BEGIN
  PERFORM set_config('gsh.payment_write', 'true', true);

  SELECT * INTO v_tx
    FROM public.payment_transactions
   WHERE id = p_payment_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_transaction_not_found';
  END IF;

  IF v_tx.status = 'succeeded' THEN
    RETURN;
  END IF;

  IF p_amount_pence IS DISTINCT FROM v_tx.amount_pence THEN
    RAISE EXCEPTION 'payment_amount_mismatch';
  END IF;

  UPDATE public.payment_transactions
     SET status = 'succeeded',
         stripe_event_id = coalesce(p_stripe_event_id, stripe_event_id),
         stripe_checkout_session_id = coalesce(p_stripe_session_id, stripe_checkout_session_id),
         stripe_payment_intent_id = coalesce(p_stripe_payment_intent, stripe_payment_intent_id),
         completed_at = now(),
         payment_method = 'stripe'
   WHERE id = p_payment_transaction_id;

  IF v_tx.payer_type = 'member' THEN
    INSERT INTO public.event_registrations
      (society_id, event_id, member_id, status, paid, amount_paid_pence, paid_at, payment_method, payment_transaction_id, stripe_checkout_session_id)
    VALUES
      (v_tx.society_id, v_tx.event_id, v_tx.member_id, 'in', true, p_amount_pence, now(), 'stripe', v_tx.id, p_stripe_session_id)
    ON CONFLICT (event_id, member_id) DO UPDATE
      SET paid = true,
          amount_paid_pence = EXCLUDED.amount_paid_pence,
          paid_at = now(),
          status = 'in',
          payment_method = 'stripe',
          payment_transaction_id = EXCLUDED.payment_transaction_id,
          stripe_checkout_session_id = EXCLUDED.stripe_checkout_session_id,
          removed_from_event_at = NULL,
          removed_by_member_id = NULL;
  ELSIF v_tx.payer_type = 'guest' THEN
    UPDATE public.event_guests g
       SET paid = true,
           amount_paid_pence = p_amount_pence,
           payment_method = 'stripe',
           payment_transaction_id = v_tx.id,
           stripe_checkout_session_id = p_stripe_session_id
     WHERE g.id = v_tx.guest_id
       AND g.event_id = v_tx.event_id;
  END IF;
END;
$w$;

REVOKE ALL ON FUNCTION public.apply_event_stripe_payment(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_event_stripe_payment(uuid, text, text, text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
