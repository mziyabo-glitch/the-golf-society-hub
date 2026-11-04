const PRODUCTION_PROJECT_REF = "eaenzjwecrrbhibrvgsb";

type Env = Record<string, string | undefined>;

export function isPaymentStaging(env: Env = process.env): boolean {
  return env.GSH_PAYMENT_STAGING === "1" || env.EXPO_PUBLIC_GSH_PAYMENT_STAGING === "1";
}

function mentionsProduction(value: string | undefined): boolean {
  return (value ?? "").toLowerCase().includes(PRODUCTION_PROJECT_REF);
}

/**
 * Staging mode refuses the live Supabase project and any Stripe key that is
 * not a test secret. Unset Stripe keys are allowed so the app can boot with
 * online payments still disabled. Returns null when staging mode is off.
 */
export function paymentStagingEnvError(env: Env = process.env): string | null {
  if (!isPaymentStaging(env)) return null;

  const targets = [
    env.SUPABASE_URL,
    env.EXPO_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.DATABASE_URL,
    env.STAGING_DATABASE_URL,
  ];
  if (targets.some(mentionsProduction)) {
    return "Refusing staging mode: Supabase target is production project eaenzjwecrrbhibrvgsb";
  }

  const secret = env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (secret.startsWith("sk_live_") || secret.startsWith("rk_live_")) {
    return "Refusing staging mode: live Stripe secret key";
  }
  if (secret && !secret.startsWith("sk_test_")) {
    return "Refusing staging mode: STRIPE_SECRET_KEY must start with sk_test_";
  }

  const publishable = (env.STRIPE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();
  if (publishable.startsWith("pk_live_")) {
    return "Refusing staging mode: live Stripe publishable key";
  }

  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("EXPO_PUBLIC_") || !value) continue;
    if (value.includes(PRODUCTION_PROJECT_REF)) {
      return "Refusing staging mode: Supabase target is production project eaenzjwecrrbhibrvgsb";
    }
    if (/sk_(live|test)_/.test(value) || value.includes("service_role")) {
      return `Refusing staging mode: secret material in ${key}`;
    }
  }

  return null;
}

export function stagingRefusalResponse(): Response | null {
  const reason = paymentStagingEnvError();
  if (!reason) return null;
  console.error(reason);
  return Response.json({ error: "Staging configuration refused" }, { status: 503 });
}
