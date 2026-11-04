/**
 * Staging-only platform charges.
 *
 * STAGING_PLATFORM_ONLY_PAYMENTS must be exactly "true". Any other value,
 * including unset, leaves Connect routing unchanged. When the flag is on it
 * still fails closed against production, a production Node environment, or a
 * Stripe key that is not sk_test_. A society whose Connect account can already
 * take charges keeps the existing destination charge.
 */

const PRODUCTION_PROJECT_REF = "eaenzjwecrrbhibrvgsb";

export const STAGING_PLATFORM_CHARGE_METADATA_KEY = "staging_platform_charge";
export const STAGING_PLATFORM_CHARGE_METADATA_VALUE = "true";
export const STAGING_PLATFORM_CHARGE_ROUTE = "staging_platform";

type Env = Record<string, string | undefined>;

export type StagingPlatformChargeDecision =
  | { mode: "off" }
  | { mode: "refused"; reason: string }
  | { mode: "platform" }
  | { mode: "connect" };

function mentionsProduction(value: string | undefined): boolean {
  return (value ?? "").toLowerCase().includes(PRODUCTION_PROJECT_REF);
}

export function stagingPlatformChargeRefusal(env: Env, stripeKey: string | undefined): string | null {
  if (env.NODE_ENV === "production") {
    return "Staging platform payments are refused in production.";
  }
  const targets = [
    env.SUPABASE_URL,
    env.EXPO_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.DATABASE_URL,
    env.STAGING_DATABASE_URL,
  ];
  if (targets.some(mentionsProduction)) {
    return "Staging platform payments are refused for production project eaenzjwecrrbhibrvgsb.";
  }
  const key = (stripeKey ?? env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key.startsWith("sk_test_")) {
    return "Staging platform payments require a Stripe test key.";
  }
  return null;
}

export function stagingPlatformChargePermitted(env: Env = process.env, stripeKey?: string): boolean {
  if (env.STAGING_PLATFORM_ONLY_PAYMENTS !== "true") return false;
  return stagingPlatformChargeRefusal(env, stripeKey) == null;
}

export function stagingPlatformChargeDecision(input: {
  env?: Env;
  stripeKey?: string;
  chargesEnabled: boolean;
  connectAccountId: string | null | undefined;
}): StagingPlatformChargeDecision {
  const env = input.env ?? process.env;
  if (env.STAGING_PLATFORM_ONLY_PAYMENTS !== "true") return { mode: "off" };
  const reason = stagingPlatformChargeRefusal(env, input.stripeKey);
  if (reason) return { mode: "refused", reason };
  const accountId = input.connectAccountId?.trim() ?? "";
  if (input.chargesEnabled && accountId) return { mode: "connect" };
  return { mode: "platform" };
}

const STAGING_PLATFORM_EVENT_LABEL = "(staging platform charge)";

export function routeStagingCheckout<T extends {
  connectAccountId: string | null;
  platformCharge?: boolean;
  beneficiaryChargesEnabled?: boolean;
  eventName: string;
}>(
  checkout: T,
  env: Env,
  stripeKey: string | undefined,
): { ok: true; checkout: T } | { ok: false; error: string } {
  const decision = stagingPlatformChargeDecision({
    env,
    stripeKey,
    chargesEnabled: checkout.beneficiaryChargesEnabled === true,
    connectAccountId: checkout.connectAccountId,
  });
  if (decision.mode === "refused") return { ok: false, error: decision.reason };
  const account = checkout.connectAccountId?.trim() ?? "";
  if (decision.mode === "off" || decision.mode === "connect") {
    if (!account || checkout.beneficiaryChargesEnabled === false) {
      return { ok: false, error: "Payment beneficiary Connect account is not ready" };
    }
    return { ok: true, checkout: { ...checkout, platformCharge: false, connectAccountId: account } };
  }
  const eventName = checkout.eventName.includes(STAGING_PLATFORM_EVENT_LABEL)
    ? checkout.eventName
    : `${checkout.eventName} ${STAGING_PLATFORM_EVENT_LABEL}`;
  return {
    ok: true,
    checkout: { ...checkout, platformCharge: true, connectAccountId: null, eventName },
  };
}
