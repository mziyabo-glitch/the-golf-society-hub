#!/usr/bin/env node
/**
 * signup-many.mjs — Create N test users against Supabase Auth.
 *
 * Usage:
 *   node signup-many.mjs [N] [RUN_ID]
 *
 * Email pattern: loadtest+<RUN_ID>+<index>@example.com
 * Throttles to BATCH_SIZE concurrent requests at a time.
 */

import { config } from "dotenv";
import { randomBytes } from "crypto";

config(); // load .env

// ── Config ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TEST_PASSWORD = process.env.TEST_PASSWORD || "Password123!";
const N = parseInt(process.argv[2] || process.env.N || "20", 10);
const RUN_ID =
  process.argv[3] || process.env.RUN_ID || randomBytes(4).toString("hex");
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "10", 10);
const BATCH_DELAY_MS = parseInt(process.env.BATCH_DELAY_MS || "1000", 10);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env");
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────

function makeEmail(index) {
  return `loadtest+${RUN_ID}+${index}@example.com`;
}

async function signupOne(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });

  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║    Supabase Auth — Signup Load Test   ║");
  console.log("╚══════════════════════════════════════╝");
  console.log();
  console.log(`  RUN_ID      : ${RUN_ID}`);
  console.log(`  Users (N)   : ${N}`);
  console.log(`  Batch size  : ${BATCH_SIZE}`);
  console.log(`  Batch delay : ${BATCH_DELAY_MS}ms`);
  console.log(`  Target      : ${SUPABASE_URL}`);
  console.log();

  const emails = Array.from({ length: N }, (_, i) => makeEmail(i));
  const results = { ok: 0, fail: 0, errors: [] };
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
          return await signupOne(email);
        } catch (err) {
          return { status: 0, ok: false, body: { error: err.message } };
        }
      })
    );

    let batchOk = 0;
    let batchFail = 0;
    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      if (r.ok) {
        batchOk++;
        results.ok++;
      } else {
        batchFail++;
        results.fail++;
        results.errors.push({
          email: batch[j],
          status: r.status,
          error: r.body?.error_description || r.body?.msg || r.body?.error || "unknown",
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
  console.log(`  Total    : ${N}`);
  console.log(`  Success  : ${results.ok}`);
  console.log(`  Failed   : ${results.fail}`);
  console.log(`  Time     : ${elapsed}s`);
  console.log(`  RUN_ID   : ${RUN_ID}`);
  console.log();

  if (results.errors.length > 0) {
    console.log("── Failures ───────────────────────────");
    for (const e of results.errors) {
      console.log(`  ${e.email}  →  ${e.status} ${e.error}`);
    }
    console.log();
  }

  console.log("Email pattern: loadtest+<RUN_ID>+<0..N-1>@example.com");
  console.log(`Use this RUN_ID for login:  node login-many.mjs ${RUN_ID} ${N}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
