#!/usr/bin/env node
/**
 * login-many.mjs — Log in N test users concurrently against Supabase Auth.
 *
 * Usage:
 *   node login-many.mjs <RUN_ID> [N]
 *
 * Email pattern: loadtest+<RUN_ID>+<index>@example.com
 * Optionally calls a safe read endpoint after login to simulate real usage.
 */

import { config } from "dotenv";

config(); // load .env

// ── Config ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TEST_PASSWORD = process.env.TEST_PASSWORD || "Password123!";
const RUN_ID = process.argv[2] || process.env.RUN_ID;
const N = parseInt(process.argv[3] || process.env.N || "20", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "10", 10);
const BATCH_DELAY_MS = parseInt(process.env.BATCH_DELAY_MS || "1000", 10);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env");
  process.exit(1);
}

if (!RUN_ID) {
  console.error("ERROR: RUN_ID is required.  Usage: node login-many.mjs <RUN_ID> [N]");
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────

function makeEmail(index) {
  return `loadtest+${RUN_ID}+${index}@example.com`;
}

async function loginOne(email) {
  const t0 = Date.now();
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    }
  );

  const body = await res.json().catch(() => ({}));
  const latencyMs = Date.now() - t0;
  return { status: res.status, ok: res.ok, body, latencyMs };
}

/**
 * Optional: call a safe read endpoint with the user's access token.
 * Uses the profiles table (RLS: users can read their own row).
 */
async function readProfile(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return { status: res.status, ok: res.ok };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║    Supabase Auth — Login Load Test    ║");
  console.log("╚══════════════════════════════════════╝");
  console.log();
  console.log(`  RUN_ID      : ${RUN_ID}`);
  console.log(`  Users (N)   : ${N}`);
  console.log(`  Batch size  : ${BATCH_SIZE}`);
  console.log(`  Batch delay : ${BATCH_DELAY_MS}ms`);
  console.log(`  Target      : ${SUPABASE_URL}`);
  console.log();

  const emails = Array.from({ length: N }, (_, i) => makeEmail(i));
  const results = { ok: 0, fail: 0, reads: 0, readFails: 0, errors: [], latencies: [] };
  const t0 = Date.now();

  // Process in batches
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(emails.length / BATCH_SIZE);

    process.stdout.write(
      `  Batch ${batchNum}/${totalBatches} (${batch.length} users)...`
    );

    const batchResults = await Promise.all(
      batch.map(async (email) => {
        try {
          const loginResult = await loginOne(email);

          // If login succeeded, optionally hit a read endpoint
          if (loginResult.ok && loginResult.body?.access_token) {
            try {
              const readResult = await readProfile(loginResult.body.access_token);
              return { ...loginResult, email, readOk: readResult.ok };
            } catch {
              return { ...loginResult, email, readOk: false };
            }
          }

          return { ...loginResult, email, readOk: null };
        } catch (err) {
          return {
            status: 0,
            ok: false,
            body: { error: err.message },
            latencyMs: 0,
            email,
            readOk: null,
          };
        }
      })
    );

    let batchOk = 0;
    let batchFail = 0;
    for (const r of batchResults) {
      if (r.ok) {
        batchOk++;
        results.ok++;
        results.latencies.push(r.latencyMs);
        if (r.readOk === true) results.reads++;
        if (r.readOk === false) results.readFails++;
      } else {
        batchFail++;
        results.fail++;
        results.errors.push({
          email: r.email,
          status: r.status,
          error:
            r.body?.error_description || r.body?.msg || r.body?.error || "unknown",
        });
      }
    }

    console.log(` ✓ ${batchOk} ok, ${batchFail} fail`);

    // Delay between batches (skip after last batch)
    if (i + BATCH_SIZE < emails.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  // ── Summary ──────────────────────────────────────────────────────
  console.log();
  console.log("── Summary ────────────────────────────");
  console.log(`  Total logins : ${N}`);
  console.log(`  Success      : ${results.ok}`);
  console.log(`  Failed       : ${results.fail}`);
  console.log(`  Time         : ${elapsed}s`);
  console.log();

  if (results.latencies.length > 0) {
    console.log("── Latency (login) ────────────────────");
    console.log(`  Min          : ${Math.min(...results.latencies)}ms`);
    console.log(`  Median (p50) : ${percentile(results.latencies, 50)}ms`);
    console.log(`  p95          : ${percentile(results.latencies, 95)}ms`);
    console.log(`  p99          : ${percentile(results.latencies, 99)}ms`);
    console.log(`  Max          : ${Math.max(...results.latencies)}ms`);
    console.log();
  }

  if (results.reads > 0 || results.readFails > 0) {
    console.log("── Post-login read (profiles) ─────────");
    console.log(`  Success      : ${results.reads}`);
    console.log(`  Failed       : ${results.readFails}`);
    console.log();
  }

  if (results.errors.length > 0) {
    console.log("── Failures ───────────────────────────");
    for (const e of results.errors) {
      console.log(`  ${e.email}  →  ${e.status} ${e.error}`);
    }
    console.log();
  }

  // Exit code: non-zero if any failures
  if (results.fail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
