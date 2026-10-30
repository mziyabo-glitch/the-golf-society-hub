#!/usr/bin/env node
/**
 * Apply Phase1 QA seed/cleanup SQL when SUPABASE_DB_URL (Postgres connection string) is available.
 * In Cursor cloud without DB URL, apply via Supabase MCP execute_sql instead.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const mode = process.argv[2] === "cleanup" ? "cleanup" : "seed";
const file =
  mode === "cleanup"
    ? path.join("scripts", "qa", "cleanup-phase1-fixtures.sql")
    : path.join("scripts", "qa", "seed-phase1-fixtures.sql");

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(
    [
      `No SUPABASE_DB_URL — cannot run ${mode} from this script.`,
      `Apply ${file} via Supabase SQL editor / MCP execute_sql, then:`,
      `  node scripts/qa/fetch-fixtures.mjs`,
    ].join("\n"),
  );
  process.exit(2);
}

const sql = fs.readFileSync(file, "utf8");
const result = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`${mode} applied from ${file}`);
