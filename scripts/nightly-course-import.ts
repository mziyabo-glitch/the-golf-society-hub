import dotenv from "dotenv";
import { runNightlyCourseImport } from "../lib/server/courseImportEngine";

dotenv.config();

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  const dryRun = hasArg("--dry-run");
  const overwriteManualOverrides = hasArg("--overwrite-manual");
  const skipSocietySeeds = hasArg("--skip-society-seeds");

  const startedAt = Date.now();
  const { batchId, results } = await runNightlyCourseImport({
    dryRun,
    overwriteManualOverrides,
    includeSocietySeeds: !skipSocietySeeds,
    triggerType: "nightly",
  });

  const ok = results.filter((r) => r.status === "ok").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const elapsedMs = Date.now() - startedAt;

  console.log("[course-import-nightly] batch:", batchId);
  console.log("[course-import-nightly] dryRun:", dryRun);
  console.log("[course-import-nightly] totals:", { ok, partial, failed, total: results.length, elapsedMs });

  for (const item of results) {
    const issues = item.validationIssues.length;
    console.log(
      `[course-import-nightly] ${item.status.toUpperCase()} | ${item.courseName} | api_id=${item.apiId ?? "n/a"} | issues=${issues}` +
        (item.error ? ` | error=${item.error}` : ""),
    );
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[course-import-nightly] fatal:", message);
  process.exit(1);
});
