import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
    const script = readFileSync(path.join(root, "scripts/payments/local-staging.sh"), "utf8");
    expect(script).toContain("supabase stack status --env --output-format text");
    expect(script).not.toContain("supabase status --env --output-format text");
    expect(script).toContain("supabase status -o env");
    expect(script).toContain("eaenzjwecrrbhibrvgsb");
    const setup = script.slice(script.indexOf("cmd_setup()"), script.indexOf("cmd_start()"));
    expect(setup.indexOf("migrate_legacy_staging_env")).toBeGreaterThan(-1);
    expect(setup.indexOf("migrate_legacy_staging_env")).toBeLessThan(setup.indexOf("ensure_env_file"));
  });

  it("moves a leftover staging env file before a new password file can be written", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gsh-staging-env-"));
    try {
      writeFileSync(
        path.join(dir, ".env.staging.local"),
        "STAGING_ACCOUNT_PASSWORD=abcdefghijklmnopqrstuvwxyz\nEXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n",
      );
      execFileSync("bash", ["-lc", `
        set -euo pipefail
        export STAGING_ROOT="$1"
        export STAGING_ENV_FILE="$1/staging.local.env"
        source "$2"
        migrate_legacy_staging_env
        test ! -f "$1/.env.staging.local"
        grep -q '^STAGING_ACCOUNT_PASSWORD=abcdefghijklmnopqrstuvwxyz$' "$1/staging.local.env"
      `, "bash", dir, path.join(root, "scripts/payments/local-staging.sh")], { stdio: "pipe" });

      writeFileSync(path.join(dir, "staging.local.env"), "STAGING_ACCOUNT_PASSWORD=keep-this-password-value\n");
      writeFileSync(path.join(dir, ".env.staging.local"), "STAGING_ACCOUNT_PASSWORD=old-legacy-password-value\n");
      let failed = false;
      try {
        execFileSync("bash", ["-lc", `
          set -euo pipefail
          export STAGING_ROOT="$1"
          export STAGING_ENV_FILE="$1/staging.local.env"
          source "$2"
          migrate_legacy_staging_env
        `, "bash", dir, path.join(root, "scripts/payments/local-staging.sh")], { stdio: "pipe" });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
      expect(readFileSync(path.join(dir, "staging.local.env"), "utf8")).toContain("keep-this-password-value");

      let refused = false;
      try {
        execFileSync("bash", ["-lc", `
          set -euo pipefail
          export STAGING_ROOT="$1"
          source "$2"
          refuse_value SUPABASE_URL "https://eaenzjwecrrbhibrvgsb.supabase.co"
        `, "bash", dir, path.join(root, "scripts/payments/local-staging.sh")], { stdio: "pipe" });
      } catch {
        refused = true;
      }
      expect(refused).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
