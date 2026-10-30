-- Public guest entry fees are paid with a single-purpose invitation token.
-- The raw token is returned once to the guest. Only its hash is stored.
-- Existing public RSVP via submit_public_event_rsvp_guest is unchanged.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_deadline_at timestamptz;

ALTER TABLE public.event_guests DROP CONSTRAINT IF EXISTS event_guests_sex_check;
ALTER TABLE public.event_guests ALTER COLUMN sex DROP NOT NULL;
ALTER TABLE public.event_guests
  ADD CONSTRAINT event_guests_sex_check
  CHECK (sex IS NULL OR sex IN ('male', 'female'));

CREATE TABLE IF NOT EXISTS public.event_guest_payment_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.event_guests(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_guest_payment_invitations_token_hash_uq UNIQUE (token_hash),
  CONSTRAINT event_guest_payment_invitations_guest_uq UNIQUE (guest_id)
);

CREATE INDEX IF NOT EXISTS idx_event_guest_payment_invitations_event
  ON public.event_guest_payment_invitations (event_id);

ALTER TABLE public.event_guest_payment_invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_guest_payment_invitations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.event_guest_payment_invitations TO service_role;

DROP FUNCTION IF EXISTS public.submit_public_guest_rsvp_with_payment_token(uuid, text);

CREATE FUNCTION public.submit_public_guest_rsvp_with_payment_token(
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
    AND coalesce(v_charges, false)
    AND length(trim(coalesce(v_account, ''))) > 0
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

COMMENT ON TABLE public.event_guest_payment_invitations IS
  'Hashed single-purpose guest fee invitation. Raw tokens are not stored.';

NOTIFY pgrst, 'reload schema';
