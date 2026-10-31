import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { paymentStagingEnvError } from "@/lib/payments/stagingGuard";

const root = path.resolve(__dirname, "../..");

describe("payment staging guard", () => {
  it("leaves normal runs alone", () => {
    expect(paymentStagingEnvError({ SUPABASE_URL: "https://eaenzjwecrrbhibrvgsb.supabase.co" })).toBeNull();
  });

  it("refuses the production project and live Stripe keys in staging mode", () => {
    expect(
      paymentStagingEnvError({
        GSH_PAYMENT_STAGING: "1",
        EXPO_PUBLIC_SUPABASE_URL: "https://eaenzjwecrrbhibrvgsb.supabase.co",
      }),
    ).toMatch(/eaenzjwecrrbhibrvgsb/);
    expect(
      paymentStagingEnvError({
        GSH_PAYMENT_STAGING: "1",
        EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        STRIPE_SECRET_KEY: "sk_live_secret",
      }),
    ).toMatch(/live Stripe/);
    expect(
      paymentStagingEnvError({
        GSH_PAYMENT_STAGING: "1",
        EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        STRIPE_SECRET_KEY: "sk_not_a_test_key",
      }),
    ).toMatch(/sk_test_/);
    expect(
      paymentStagingEnvError({
        EXPO_PUBLIC_GSH_PAYMENT_STAGING: "1",
        EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        EXPO_PUBLIC_STRIPE_SECRET: "sk_test_123",
      }),
    ).toMatch(/secret material/);
  });

  it("allows a local URL with a test secret or with no Stripe key", () => {
    expect(
      paymentStagingEnvError({
        GSH_PAYMENT_STAGING: "1",
        EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_URL: "http://127.0.0.1:54321",
        STRIPE_SECRET_KEY: "sk_test_123",
      }),
    ).toBeNull();
    expect(
      paymentStagingEnvError({
        GSH_PAYMENT_STAGING: "1",
        EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toBeNull();
  });

  it("does not commit a staging password", () => {
    for (const file of [
      "supabase/seeds/staging_m4_zgs_payments.sql",
      "docs/payments/STAGING.md",
      "scripts/payments/local-staging.sh",
    ]) {
      expect(readFileSync(path.join(root, file), "utf8")).not.toContain("StagingPayTest");
    }
    const doc = readFileSync(path.join(root, "docs/payments/STAGING.md"), "utf8");
    expect(doc).toContain("20261030190000_stripe_payment_integrity.sql");
    expect(doc).toContain("20261030200000_guest_payment_invitations.sql");
    expect(doc).toContain("20261030210000_payment_destination_and_checkout_eligibility.sql");
    expect(doc).toContain("eaenzjwecrrbhibrvgsb");
  });
});
