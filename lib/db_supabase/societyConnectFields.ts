/** Client patches must not carry Stripe Connect ownership. The database rejects them too. */
const STRIPE_CONNECT_OWNERSHIP_FIELDS = new Set([
  "stripe_connect_account_id",
  "stripe_connect_charges_enabled",
  "stripe_connect_details_submitted",
  "stripeConnectAccountId",
  "stripeConnectChargesEnabled",
  "stripeConnectDetailsSubmitted",
]);

export function omitStripeConnectOwnershipFields<T extends Record<string, unknown>>(updates: T): Partial<T> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (!STRIPE_CONNECT_OWNERSHIP_FIELDS.has(key)) next[key] = value;
  }
  return next as Partial<T>;
}
