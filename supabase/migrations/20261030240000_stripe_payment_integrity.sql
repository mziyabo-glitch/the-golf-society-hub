-- Repairs databases that already applied the first Stripe payments draft.
-- Safe to run after the corrected foundation migration as well.
-- Does not enable online payments.

ALTER TABLE public.societies
  ADD COLUMN IF NOT EXISTS online_payments_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text NULL,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_bank_transfer_instructions text NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS member_entry_fee_pence integer NULL
    CHECK (member_entry_fee_pence IS NULL OR member_entry_fee_pence >= 0),
  ADD COLUMN IF NOT EXISTS guest_entry_fee_pence integer NULL
    CHECK (guest_entry_fee_pence IS NULL OR guest_entry_fee_pence >= 0),
  ADD COLUMN IF NOT EXISTS joint_participant_entry_fee_pence integer NULL
    CHECK (joint_participant_entry_fee_pence IS NULL OR joint_participant_entry_fee_pence >= 0);

ALTER TABLE public.event_societies
  ADD COLUMN IF NOT EXISTS payment_beneficiary_society_id uuid NULL
    REFERENCES public.societies(id) ON DELETE SET NULL;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS society_name text,
  ADD COLUMN IF NOT EXISTS beneficiary_society_name text,
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS event_date_snapshot text,
  ADD COLUMN IF NOT EXISTS payer_display_name text,
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_receipt_url text,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text,
  ADD COLUMN IF NOT EXISTS stripe_refund_status text,
  ADD COLUMN IF NOT EXISTS resolution_required boolean NOT NULL DEFAULT false;

UPDATE public.payment_transactions
   SET society_name = coalesce(society_name, 'Unknown society'),
       beneficiary_society_name = coalesce(beneficiary_society_name, 'Unknown society'),
       event_name = coalesce(event_name, 'Unknown event'),
       payer_display_name = coalesce(nullif(payer_display_name, ''), 'Unknown payer')
 WHERE society_name IS NULL
    OR beneficiary_society_name IS NULL
    OR event_name IS NULL
    OR payer_display_name IS NULL
    OR payer_display_name = '';

ALTER TABLE public.payment_transactions
  ALTER COLUMN society_name SET NOT NULL,
  ALTER COLUMN beneficiary_society_name SET NOT NULL,
  ALTER COLUMN event_name SET NOT NULL,
  ALTER COLUMN payer_display_name SET NOT NULL;

ALTER TABLE public.payment_transactions ALTER COLUMN society_id DROP NOT NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN beneficiary_society_id DROP NOT NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN guest_id DROP NOT NULL;

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_society_id_fkey;
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_beneficiary_society_id_fkey;
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_event_id_fkey;
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_member_id_fkey;
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_guest_id_fkey;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_society_id_fkey
    FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE SET NULL;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_beneficiary_society_id_fkey
    FOREIGN KEY (beneficiary_society_id) REFERENCES public.societies(id) ON DELETE SET NULL;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_guest_id_fkey
    FOREIGN KEY (guest_id) REFERENCES public.event_guests(id) ON DELETE SET NULL;

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_payer_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_payer_check CHECK (
    (
      payer_type = 'member'
      AND guest_id IS NULL
      AND (member_id IS NOT NULL OR length(payer_display_name) > 0)
    )
    OR (
      payer_type = 'guest'
      AND member_id IS NULL
      AND (guest_id IS NOT NULL OR length(payer_display_name) > 0)
    )
  );

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_currency_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_currency_check CHECK (currency = 'gbp');

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled', 'refunded', 'refund_pending'));

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_stripe_refund_status_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_stripe_refund_status_check
  CHECK (stripe_refund_status IS NULL OR stripe_refund_status IN ('pending', 'succeeded', 'failed'));

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_payment_intent_uq;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_payment_intent_uq UNIQUE (stripe_payment_intent_id);

DROP INDEX IF EXISTS public.payment_transactions_open_member_uq;
CREATE UNIQUE INDEX payment_transactions_open_member_uq
  ON public.payment_transactions (event_id, member_id)
  WHERE status IN ('pending', 'succeeded', 'refund_pending')
    AND payer_type = 'member'
    AND event_id IS NOT NULL
    AND member_id IS NOT NULL;

DROP INDEX IF EXISTS public.payment_transactions_open_guest_uq;
CREATE UNIQUE INDEX payment_transactions_open_guest_uq
  ON public.payment_transactions (event_id, guest_id)
  WHERE status IN ('pending', 'succeeded', 'refund_pending')
    AND payer_type = 'guest'
    AND event_id IS NOT NULL
    AND guest_id IS NOT NULL;

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS payment_method text NULL
    CHECK (payment_method IS NULL OR payment_method IN ('stripe', 'manual', 'bank_transfer')),
  ADD COLUMN IF NOT EXISTS payment_transaction_id uuid NULL
    REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text NULL,
  ADD COLUMN IF NOT EXISTS payment_resolution_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.event_guests
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method text NULL
    CHECK (payment_method IS NULL OR payment_method IN ('stripe', 'manual', 'bank_transfer')),
  ADD COLUMN IF NOT EXISTS payment_transaction_id uuid NULL
    REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text NULL,
  ADD COLUMN IF NOT EXISTS amount_paid_pence integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_resolution_required boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS payment_transactions_select_manco ON public.payment_transactions;
DROP POLICY IF EXISTS payment_transactions_select_finance ON public.payment_transactions;
CREATE POLICY payment_transactions_select_finance
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid()
      AND m.society_id = payment_transactions.society_id
      AND upper(coalesce(m.role, '')) IN ('CAPTAIN', 'TREASURER')
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

REVOKE ALL ON TABLE public.payment_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payment_transactions TO authenticated;
GRANT ALL ON TABLE public.payment_transactions TO service_role;

CREATE OR REPLACE FUNCTION public.payment_mutation_from_end_user()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT current_user IN ('anon', 'authenticated', 'authenticator')
$fn$;

CREATE OR REPLACE FUNCTION public.guard_event_registration_payment_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $g$
BEGIN
  IF NOT public.payment_mutation_from_end_user() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.paid IS TRUE
       OR coalesce(NEW.amount_paid_pence, 0) <> 0
       OR NEW.paid_at IS NOT NULL
       OR NEW.marked_by_member_id IS NOT NULL
       OR NEW.payment_method IS NOT NULL
       OR NEW.payment_transaction_id IS NOT NULL
       OR NEW.stripe_checkout_session_id IS NOT NULL
       OR coalesce(NEW.payment_resolution_required, false) IS TRUE THEN
      RAISE EXCEPTION 'event_registration_payment_forbidden'
        USING HINT = 'Payment fields are updated by Treasurer tools or the Stripe webhook.';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.paid IS DISTINCT FROM OLD.paid
       OR NEW.amount_paid_pence IS DISTINCT FROM OLD.amount_paid_pence
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.marked_by_member_id IS DISTINCT FROM OLD.marked_by_member_id
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.payment_transaction_id IS DISTINCT FROM OLD.payment_transaction_id
       OR NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id
       OR NEW.payment_resolution_required IS DISTINCT FROM OLD.payment_resolution_required THEN
      RAISE EXCEPTION 'event_registration_payment_forbidden'
        USING HINT = 'Payment fields are updated by Treasurer tools or the Stripe webhook.';
    END IF;
  END IF;

  RETURN NEW;
END;
$g$;

DROP TRIGGER IF EXISTS trg_event_reg_guard_payment ON public.event_registrations;
CREATE TRIGGER trg_event_reg_guard_payment
  BEFORE INSERT OR UPDATE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_registration_payment_columns();

CREATE OR REPLACE FUNCTION public.guard_event_guest_payment_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $gg$
BEGIN
  IF NOT public.payment_mutation_from_end_user() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.paid IS TRUE
       OR coalesce(NEW.amount_paid_pence, 0) <> 0
       OR NEW.payment_method IS NOT NULL
       OR NEW.payment_transaction_id IS NOT NULL
       OR NEW.stripe_checkout_session_id IS NOT NULL
       OR coalesce(NEW.payment_resolution_required, false) IS TRUE THEN
      RAISE EXCEPTION 'event_guest_payment_forbidden'
        USING HINT = 'Guest payment fields are updated by Treasurer tools or the Stripe webhook.';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.paid IS DISTINCT FROM OLD.paid
       OR NEW.amount_paid_pence IS DISTINCT FROM OLD.amount_paid_pence
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.payment_transaction_id IS DISTINCT FROM OLD.payment_transaction_id
       OR NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id
       OR NEW.payment_resolution_required IS DISTINCT FROM OLD.payment_resolution_required THEN
      RAISE EXCEPTION 'event_guest_payment_forbidden'
        USING HINT = 'Guest payment fields are updated by Treasurer tools or the Stripe webhook.';
    END IF;
  END IF;

  RETURN NEW;
END;
$gg$;

DROP TRIGGER IF EXISTS trg_event_guest_guard_payment ON public.event_guests;
CREATE TRIGGER trg_event_guest_guard_payment
  BEFORE INSERT OR UPDATE ON public.event_guests
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_guest_payment_columns();

-- ---------------------------------------------------------------------------
-- Manual mark paid. Does not overwrite a completed Stripe payment unless
-- a Captain or Treasurer passes p_authorised_correction.
-- Handicapper and Secretary may still record manual payments.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mark_event_paid(uuid, uuid, uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.mark_event_paid(
  p_event_id uuid,
  p_society_id uuid,
  p_target_member_id uuid,
  p_paid boolean,
  p_amount_pence integer DEFAULT 0,
  p_authorised_correction boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_host_society_id uuid;
  v_event_allows boolean;
  v_caller_id uuid;
  v_caller_role text;
  v_target_member uuid;
  v_reg_society_id uuid;
  v_existing_method text;
  v_existing_paid boolean;
  v_existing_tx uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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
    RAISE EXCEPTION 'No membership in this society. Switch the active society to manage payments for this club.';
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
    RAISE EXCEPTION 'Member not found for this society. You can only record payments for your society members.';
  END IF;

  SELECT r.payment_method, r.paid, r.payment_transaction_id
    INTO v_existing_method, v_existing_paid, v_existing_tx
    FROM public.event_registrations r
   WHERE r.event_id = p_event_id
     AND r.member_id = v_target_member
   FOR UPDATE;

  IF v_existing_method = 'stripe' AND v_existing_paid IS TRUE AND v_existing_tx IS NOT NULL THEN
    IF p_paid IS TRUE AND NOT coalesce(p_authorised_correction, false) THEN
      RETURN;
    END IF;
    IF NOT coalesce(p_authorised_correction, false)
       OR upper(coalesce(v_caller_role, '')) NOT IN ('CAPTAIN', 'TREASURER') THEN
      RAISE EXCEPTION 'stripe_payment_locked'
        USING HINT = 'A completed Stripe payment can be changed only by a Captain or Treasurer using an authorised correction.';
    END IF;
  END IF;

  INSERT INTO public.event_registrations (
    society_id, event_id, member_id, status, paid, amount_paid_pence, paid_at,
    marked_by_member_id, payment_method, payment_resolution_required
  ) VALUES (
    v_reg_society_id, p_event_id, v_target_member, 'in',
    p_paid,
    CASE WHEN p_paid THEN coalesce(p_amount_pence, 0) ELSE 0 END,
    CASE WHEN p_paid THEN now() ELSE NULL END,
    v_caller_id,
    CASE WHEN p_paid THEN 'manual' ELSE NULL END,
    false
  )
  ON CONFLICT (event_id, member_id) DO UPDATE
    SET paid = EXCLUDED.paid,
        amount_paid_pence = EXCLUDED.amount_paid_pence,
        paid_at = EXCLUDED.paid_at,
        marked_by_member_id = EXCLUDED.marked_by_member_id,
        payment_method = CASE WHEN EXCLUDED.paid THEN 'manual' ELSE NULL END,
        payment_resolution_required = CASE
          WHEN public.event_registrations.payment_method = 'stripe' AND EXCLUDED.paid IS FALSE THEN true
          ELSE false
        END,
        status = CASE WHEN EXCLUDED.paid THEN 'in' ELSE public.event_registrations.status END,
        removed_from_event_at = public.event_registrations.removed_from_event_at,
        removed_by_member_id = public.event_registrations.removed_by_member_id;
END;
$f$;

REVOKE ALL ON FUNCTION public.mark_event_paid(uuid, uuid, uuid, boolean, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_event_paid(uuid, uuid, uuid, boolean, integer, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Guest manual payments. Same Stripe lock as members.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_event_guest_paid(
  p_guest_id uuid,
  p_paid boolean,
  p_amount_pence integer DEFAULT 0,
  p_authorised_correction boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $gp$
DECLARE
  v_uid uuid := auth.uid();
  v_guest public.event_guests%ROWTYPE;
  v_caller_id uuid;
  v_caller_role text;
  v_event_allows boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_guest
    FROM public.event_guests g
   WHERE g.id = p_guest_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest not found';
  END IF;

  v_event_allows :=
    EXISTS (
      SELECT 1 FROM public.events e
       WHERE e.id = v_guest.event_id
         AND e.society_id = v_guest.society_id
    )
    OR EXISTS (
      SELECT 1 FROM public.event_societies es
       WHERE es.event_id = v_guest.event_id
         AND es.society_id = v_guest.society_id
    );
  IF NOT v_event_allows THEN
    RAISE EXCEPTION 'This society is not part of this event';
  END IF;

  SELECT m.id, m.role
    INTO v_caller_id, v_caller_role
    FROM public.members m
   WHERE m.user_id = v_uid
     AND m.society_id = v_guest.society_id
   LIMIT 1;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'No membership in this society. Switch the active society to manage payments for this club.';
  END IF;

  IF upper(coalesce(v_caller_role, '')) NOT IN ('CAPTAIN', 'TREASURER', 'SECRETARY', 'HANDICAPPER') THEN
    RAISE EXCEPTION 'Only Captain, Treasurer, Secretary, or Handicapper can mark payments';
  END IF;

  IF v_guest.payment_method = 'stripe' AND v_guest.paid IS TRUE AND v_guest.payment_transaction_id IS NOT NULL THEN
    IF p_paid IS TRUE AND NOT coalesce(p_authorised_correction, false) THEN
      RETURN;
    END IF;
    IF NOT coalesce(p_authorised_correction, false)
       OR upper(coalesce(v_caller_role, '')) NOT IN ('CAPTAIN', 'TREASURER') THEN
      RAISE EXCEPTION 'stripe_payment_locked'
        USING HINT = 'A completed Stripe payment can be changed only by a Captain or Treasurer using an authorised correction.';
    END IF;
  END IF;

  UPDATE public.event_guests g
     SET paid = p_paid,
         amount_paid_pence = CASE WHEN p_paid THEN coalesce(p_amount_pence, 0) ELSE 0 END,
         payment_method = CASE WHEN p_paid THEN 'manual' ELSE NULL END,
         payment_resolution_required = CASE
           WHEN g.payment_method = 'stripe' AND p_paid IS FALSE THEN true
           ELSE false
         END
   WHERE g.id = p_guest_id;
END;
$gp$;

REVOKE ALL ON FUNCTION public.mark_event_guest_paid(uuid, boolean, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_event_guest_paid(uuid, boolean, integer, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Webhook apply. Service role only. Marks succeeded only after the
-- registration or guest row is updated. Does not restore a withdrawn player.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_event_stripe_payment(uuid, text, text, text, integer);

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
AS $w$
DECLARE
  v_tx public.payment_transactions%ROWTYPE;
  v_reg_status text;
  v_removed timestamptz;
  v_hold boolean := false;
  v_rows integer := 0;
  v_connect text;
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
      INSERT INTO public.event_registrations (
        society_id, event_id, member_id, status, paid, amount_paid_pence, paid_at,
        payment_method, payment_transaction_id, stripe_checkout_session_id,
        payment_resolution_required
      ) VALUES (
        v_tx.society_id, v_tx.event_id, v_tx.member_id, 'in', true, p_amount_pence, now(),
        'stripe', v_tx.id, p_stripe_session_id, false
      );
      v_hold := false;
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
$w$;

REVOKE ALL ON FUNCTION public.apply_event_stripe_payment(uuid, text, text, text, integer, text, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_event_stripe_payment(uuid, text, text, text, integer, text, text, uuid, uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Refund record. service_role only, after the server has verified the
-- Treasurer and the Stripe refund. Updates the existing ledger row.
-- A missing member, guest, or event does not block the ledger update.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_event_stripe_refund(uuid, text);
DROP FUNCTION IF EXISTS public.record_event_stripe_refund(uuid, text, text);

CREATE FUNCTION public.record_event_stripe_refund(
  p_payment_transaction_id uuid,
  p_stripe_refund_id text,
  p_refund_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rf$
DECLARE
  v_tx public.payment_transactions%ROWTYPE;
  v_status text := lower(trim(coalesce(p_refund_status, '')));
  v_refund_id text := trim(coalesce(p_stripe_refund_id, ''));
BEGIN
  IF v_refund_id = '' THEN
    RAISE EXCEPTION 'refund_id_missing';
  END IF;
  IF v_status NOT IN ('pending', 'succeeded', 'failed') THEN
    RAISE EXCEPTION 'refund_status_invalid';
  END IF;

  SELECT * INTO v_tx
    FROM public.payment_transactions
   WHERE id = p_payment_transaction_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_transaction_not_found';
  END IF;
  IF v_tx.payment_method <> 'stripe' THEN
    RAISE EXCEPTION 'refund_not_allowed';
  END IF;

  IF v_tx.stripe_refund_id IS NOT DISTINCT FROM v_refund_id AND v_tx.status = 'refunded' THEN
    RETURN;
  END IF;
  IF v_tx.stripe_refund_id IS NOT DISTINCT FROM v_refund_id
     AND v_status = 'pending'
     AND v_tx.status = 'refund_pending' THEN
    RETURN;
  END IF;
  IF v_tx.stripe_refund_id IS NOT DISTINCT FROM v_refund_id
     AND v_status = 'failed'
     AND v_tx.status = 'succeeded'
     AND v_tx.stripe_refund_status = 'failed' THEN
    RETURN;
  END IF;

  IF v_tx.status = 'refunded' THEN
    RAISE EXCEPTION 'refund_not_allowed';
  END IF;
  IF v_tx.status = 'refund_pending' AND v_tx.stripe_refund_id IS DISTINCT FROM v_refund_id THEN
    RAISE EXCEPTION 'refund_not_allowed';
  END IF;
  IF v_tx.status NOT IN ('succeeded', 'refund_pending') THEN
    RAISE EXCEPTION 'refund_not_allowed';
  END IF;

  IF v_status = 'pending' THEN
    UPDATE public.payment_transactions
       SET status = 'refund_pending',
           stripe_refund_id = v_refund_id,
           stripe_refund_status = 'pending',
           resolution_required = true
     WHERE id = p_payment_transaction_id;
    RETURN;
  END IF;

  IF v_status = 'failed' THEN
    UPDATE public.payment_transactions
       SET status = 'succeeded',
           stripe_refund_id = v_refund_id,
           stripe_refund_status = 'failed',
           resolution_required = false
     WHERE id = p_payment_transaction_id;
    RETURN;
  END IF;

  UPDATE public.event_registrations r
     SET paid = false,
         amount_paid_pence = 0,
         paid_at = NULL,
         payment_resolution_required = true
   WHERE r.payment_transaction_id = p_payment_transaction_id;

  UPDATE public.event_guests g
     SET paid = false,
         amount_paid_pence = 0,
         payment_resolution_required = true
   WHERE g.payment_transaction_id = p_payment_transaction_id;

  UPDATE public.payment_transactions
     SET status = 'refunded',
         resolution_required = true,
         stripe_refund_id = v_refund_id,
         stripe_refund_status = 'succeeded'
   WHERE id = p_payment_transaction_id;
END;
$rf$;

REVOKE ALL ON FUNCTION public.record_event_stripe_refund(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_stripe_refund(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.record_event_stripe_refund(uuid, text, text) IS
  'Records a verified Stripe refund on the existing ledger row. service_role only.';

REVOKE ALL ON FUNCTION public.payment_mutation_from_end_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_mutation_from_end_user() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_event_registration_payment_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_event_registration_payment_columns() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_event_guest_payment_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_event_guest_payment_columns() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
