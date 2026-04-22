/**
 * Smoke test for catalog freshness + stale sweep.
 *
 * Examples:
 *   npx tsx scripts/stale-course-import-smoke.ts --dry-run --force-sweep
 *   npx tsx scripts/stale-course-import-smoke.ts --dry-run --mutate-course-timestamp --api-id=12241
 *
 * --mutate-course-timestamp temporarily sets last_synced_at on one course so freshness triggers without env force.
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { runTerritoryScaleNightlyImport } from "../lib/server/courseImportEngine";

dotenv.config();

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseApiId(): number {
  const raw = process.argv.find((a) => a.startsWith("--api-id="))?.split("=")[1];
  const n = Number(raw ?? "12241");
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid --api-id");
  return Math.round(n);
}

async function main(): Promise<void> {
  const dryRun = hasArg("--dry-run");
  const forceSweep = hasArg("--force-sweep");
  const mutate = hasArg("--mutate-course-timestamp");
  const apiId = parseApiId();

  if (!forceSweep && !mutate) {
    console.error("Specify --force-sweep and/or --mutate-course-timestamp (see file header).");
    process.exit(2);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key);
  let restore: { id: string; last_synced_at: string | null } | null = null;

  if (mutate) {
    const { data: row, error } = await supabase
      .from("courses")
      .select("id, last_synced_at")
      .eq("api_id", apiId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error(`No course with api_id=${apiId}`);
    restore = { id: String(row.id), last_synced_at: row.last_synced_at != null ? String(row.last_synced_at) : null };
    const { error: upErr } = await supabase
      .from("courses")
      .update({ last_synced_at: "1990-01-01T00:00:00.000Z" })
      .eq("id", restore.id);
    if (upErr) throw new Error(upErr.message);
    console.log(`[stale-course-smoke] Marked course ${restore.id} (api_id=${apiId}) as very stale for this test.`);
  }

  try {
    const outcome = await runTerritoryScaleNightlyImport({
      dryRun,
      includeSocietySeeds: false,
      phaseOverride: "england_wales",
      forceCatalogFullRefresh: forceSweep,
      catalogFreshnessThresholds: mutate
        ? {
            minStaleCoursesToTrigger: 1,
            minCoursesWithMissingStrokeIndexToTrigger: 10_000,
            minCoursesWithIncompleteTeeBlockToTrigger: 10_000,
            staleSweepMaxCourses: 3,
          }
        : undefined,
      caps: {
        maxTotalAttempts: 0,
        maxPriorityCourses: 0,
        maxNewSeeds: 0,
        maxRetries: 0,
        maxRefreshes: 0,
        maxDiscoveryPerRun: 3,
      },
    });

    console.log("[stale-course-smoke] catalogFreshness.triggeredFullRefresh:", outcome.catalogFreshness.triggeredFullRefresh);
    console.log("[stale-course-smoke] catalogFreshness.reasons:", outcome.catalogFreshness.reasons);
    console.log(
      "[stale-course-smoke] staleCatalogSweep:",
      outcome.staleCatalogSweep
        ? {
            attempted: outcome.staleCatalogSweep.attempted,
            ok: outcome.staleCatalogSweep.ok,
            failed: outcome.staleCatalogSweep.failed,
            skippedDupApi: outcome.staleCatalogSweep.skippedDuplicateApiInBatch,
          }
        : null,
    );
    if (outcome.staleCatalogSweep?.results?.length) {
      for (const r of outcome.staleCatalogSweep.results) {
        console.log(`[stale-course-smoke] SWEEP ${r.status} | ${r.courseName} | api=${r.apiId}`);
      }
    }
  } finally {
    if (restore) {
      const { error: revErr } = await supabase
        .from("courses")
        .update({ last_synced_at: restore.last_synced_at })
        .eq("id", restore.id);
      if (revErr) console.error("[stale-course-smoke] Failed to restore last_synced_at:", revErr.message);
      else console.log("[stale-course-smoke] Restored last_synced_at for course", restore.id);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
