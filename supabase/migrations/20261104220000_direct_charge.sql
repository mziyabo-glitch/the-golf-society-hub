-- Direct charges on the society's connected account.
-- Checkout sends application_fee_amount with the Stripe-Account header.
-- It does not set transfer_data or on_behalf_of.
-- Society net on a direct charge is gross minus the Stripe card fee minus the application fee.
-- The older destination-charge identity remains accepted so those rows can still be recorded.
-- Player pays is not offered. Checkout ignores a stored player_pays value and charges the event fee exactly.
-- Historical payment snapshots are left in place.

COMMENT ON COLUMN public.societies.processing_fee_mode IS
  'Historical column. Checkout ignores player_pays and charges the event fee exactly. Player pays stays removed until a professional has reviewed UK surcharge rules.';

COMMENT ON FUNCTION public.record_event_stripe_processing_fee(uuid, text, integer, integer, integer) IS
  'Stores the Stripe card fee, the application fee, and the society net from Stripe objects. A direct charge reconciles as fee plus application fee plus net equals the gross. The older destination-charge identity remains accepted so history can still be recorded. service_role only. Does not accept an estimate.';
