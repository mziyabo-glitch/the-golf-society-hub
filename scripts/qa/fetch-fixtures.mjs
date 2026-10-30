#!/usr/bin/env node
/**
 * Fetch latest QA Phase1 fixtures from Supabase (qa_phase1_fixtures) into e2e/fixtures/phase1.json.
 *
 * Requires a platform-admin or service path. Uses direct SQL via env SUPABASE_DB_URL when set;
 * otherwise expects fixtures already applied and readable via REST with service role.
 *
 * Preferred in Cursor cloud: seed via Supabase MCP, then copy payload into e2e/fixtures/phase1.json
 * (or set QA_PHASE1_FIXTURES_JSON).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const out = path.join(process.cwd(), "e2e", "fixtures", "phase1.json");

async function main() {
  if (process.env.QA_PHASE1_FIXTURES_JSON) {
    const payload = JSON.parse(process.env.QA_PHASE1_FIXTURES_JSON);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
    console.log("Wrote fixtures from QA_PHASE1_FIXTURES_JSON →", out);
    return;
  }

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    if (fs.existsSync(out)) {
      console.log("No service role; keeping existing", out);
      return;
    }
    throw new Error(
      "Need SUPABASE_SERVICE_ROLE_KEY or QA_PHASE1_FIXTURES_JSON (or an existing e2e/fixtures/phase1.json).",
    );
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await sb.from("qa_phase1_fixtures").select("payload").eq("run_id", "latest").maybeSingle();
  if (error) throw error;
  if (!data?.payload) throw new Error("No qa_phase1_fixtures row for run_id=latest. Apply scripts/qa/seed-phase1-fixtures.sql first.");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data.payload, null, 2) + "\n");
  console.log("Wrote", out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
