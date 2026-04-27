import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import {
  runTerritoryScaleNightlyImport,
  type CourseImportRunMode,
  type TerritorySeedPhase,
} from "../lib/server/courseImportEngine";

dotenv.config();

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseNumericArg(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

async function writeFatalReport(error: unknown, context: Record<string, unknown>): Promise<void> {
  const reportsDir = resolvePath(process.cwd(), "reports", "nightly-course-import");
  await mkdir(reportsDir, { recursive: true });
  const dateKey = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${dateKey}-fatal-${timestamp}`;
  const jsonPath = resolvePath(reportsDir, `${base}.json`);
  const mdPath = resolvePath(reportsDir, `${base}.md`);
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? null : null;
  const payload = {
    fatal: true,
    message,
    stack,
    context,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  const mdLines = [
    "# Nightly Course Import Fatal Error",
    "",
    `- Generated at: \`${payload.generatedAt}\``,
    `- Message: ${message}`,
    `- Trigger type: \`${String(context.triggerType ?? "")}\``,
    `- Run mode arg: \`${String(context.modeArg ?? "")}\``,
    `- Territory arg: \`${String(context.territoryArg ?? "")}\``,
    `- Phase arg: \`${String(context.phaseArg ?? "")}\``,
    "",
    "## Context",
    "```json",
    JSON.stringify(context, null, 2),
    "```",
    "",
    "## Stack",
    "```",
    stack ?? "(no stack)",
    "```",
  ];
  await writeFile(mdPath, mdLines.join("\n"), "utf8");
  console.log("[course-import-nightly] fatal-report-json:", jsonPath);
  console.log("[course-import-nightly] fatal-report-md:", mdPath);
}

async function main(): Promise<void> {
  const dryRun = hasArg("--dry-run");
  const overwriteManualOverrides = hasArg("--overwrite-manual");
  const skipSocietySeeds = hasArg("--skip-society-seeds");
  const territoryArg = process.argv.find((arg) => arg.startsWith("--territory="));
  const phaseArg = process.argv.find((arg) => arg.startsWith("--phase="));
  const maxNewSeedsArg = process.argv.find((arg) => arg.startsWith("--max-new-seeds="));
  const maxRetriesArg = process.argv.find((arg) => arg.startsWith("--max-retries="));
  const maxRefreshesArg = process.argv.find((arg) => arg.startsWith("--max-refreshes="));
  const maxPriorityArg = process.argv.find((arg) => arg.startsWith("--max-priority="));
  const maxNewGrowthArg = process.argv.find((arg) => arg.startsWith("--max-new-growth="));
  const maxStaleRefreshArg = process.argv.find((arg) => arg.startsWith("--max-stale-candidate-refresh="));
  const maxStaleSweepArg = process.argv.find((arg) => arg.startsWith("--max-stale-sweep="));
  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1]?.trim().toLowerCase();
  const triggerType = hasArg("--manual") ? "manual" : "nightly";
  const forceCatalogFullRefresh = hasArg("--force-catalog-full-refresh");
  const runMode: CourseImportRunMode | undefined =
    modeArg === "seeding" || modeArg === "maintenance" ? (modeArg as CourseImportRunMode) : undefined;

  const startedAt = Date.now();
  const outcome = await runTerritoryScaleNightlyImport({
    dryRun,
    overwriteManualOverrides,
    includeSocietySeeds: !skipSocietySeeds,
    triggerType,
    runMode,
    territoryOverride: territoryArg?.split("=")[1]?.trim(),
    phaseOverride: (phaseArg?.split("=")[1]?.trim() as TerritorySeedPhase | undefined) ?? undefined,
    forceCatalogFullRefresh,
    caps: {
      maxPriorityCourses: parseNumericArg(maxPriorityArg?.split("=")[1]),
      maxNewSeeds: parseNumericArg(maxNewSeedsArg?.split("=")[1]),
      maxRetries: parseNumericArg(maxRetriesArg?.split("=")[1]),
      maxRefreshes: parseNumericArg(maxRefreshesArg?.split("=")[1]),
      maxNewCourseImportAttempts: parseNumericArg(maxNewGrowthArg?.split("=")[1]),
      maxStaleCandidateRefreshAttempts: parseNumericArg(maxStaleRefreshArg?.split("=")[1]),
      maxStaleCatalogSweepCourses: parseNumericArg(maxStaleSweepArg?.split("=")[1]),
    },
  });
  const { batchId, results } = outcome;

  const ok = results.filter((r) => r.status === "ok").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const elapsedMs = Date.now() - startedAt;

  console.log("[course-import-nightly] batch:", batchId);
  console.log("[course-import-nightly] batchRun:", outcome.batchRunId);
  console.log("[course-import-nightly] importRunMode:", outcome.importRunMode);
  console.log("[course-import-nightly] importRunBreakdown:", outcome.report.importRunBreakdown);
  console.log("[course-import-nightly] phase:", outcome.phase, "| territory:", outcome.territory);
  console.log("[course-import-nightly] dryRun:", dryRun);
  console.log("[course-import-nightly] totals:", { ok, partial, failed, skipped, total: results.length, elapsedMs });
  console.log("[course-import-nightly] nightlyRunExit:", outcome.nightlyRunExit);
  console.log("[course-import-nightly] discovered:", outcome.discoveredCandidates, "| attempted:", outcome.attemptedCandidates);
  console.log("[course-import-nightly] growth:", outcome.newCourseGrowthSummary, "| stale-refresh:", outcome.staleCandidateRefreshSummary);
  console.log("[course-import-nightly] inserted:", outcome.insertedCourses, "| updated:", outcome.updatedCourses);
  console.log("[course-import-nightly] rejected:", Number((outcome.report as Record<string, unknown>).rejectedCourses ?? 0));
  console.log("[course-import-nightly] missing-si:", outcome.missingSiCount);
  console.log(
    "[course-import-nightly] staleSweepSkipReason:",
    outcome.skippedStaleCatalogSweepReason ?? "(sweep ran or not eligible)",
    "| queuedAfterPhases:",
    outcome.queuedCandidatesAfterCandidatePhases,
  );
  console.log("[course-import-nightly] queueCompositionBySeedPhase:", outcome.queueCompositionBySeedPhase);
  console.log("[course-import-nightly] importYieldByWorkPhase:", outcome.importYieldByWorkPhase);
  console.log("[course-import-nightly] newCourseGrowthWaste:", outcome.newCourseGrowthWaste);
  console.log(
    "[course-import-nightly] catalogFreshness:",
    outcome.catalogFreshness.triggeredFullRefresh ? "FULL_SWEEP" : "incremental_only",
    "| reasons:",
    outcome.catalogFreshness.reasons.join("; ") || "none",
  );
  if (outcome.staleCatalogSweep) {
    console.log("[course-import-nightly] staleCatalogSweep:", {
      attempted: outcome.staleCatalogSweep.attempted,
      ok: outcome.staleCatalogSweep.ok,
      partial: outcome.staleCatalogSweep.partial,
      failed: outcome.staleCatalogSweep.failed,
      skippedDupApi: outcome.staleCatalogSweep.skippedDuplicateApiInBatch,
    });
  }

  for (const item of results) {
    const issues = item.validationIssues.length;
    console.log(
      `[course-import-nightly] ${item.status.toUpperCase()} | ${item.courseName} | api_id=${item.apiId ?? "n/a"} | issues=${issues}` +
        (item.error ? ` | error=${item.error}` : ""),
    );
  }

  const reportsDir = resolvePath(process.cwd(), "reports", "nightly-course-import");
  await mkdir(reportsDir, { recursive: true });
  const dateKey = new Date().toISOString().slice(0, 10);
  const jsonPath = resolvePath(reportsDir, `${dateKey}-${outcome.batchRunId}.json`);
  const mdPath = resolvePath(reportsDir, `${dateKey}-${outcome.batchRunId}.md`);
  await writeFile(jsonPath, JSON.stringify(outcome.report, null, 2), "utf8");

  const mdLines = [
    "# Nightly Course Import Report",
    "",
    `- Batch ID: \`${outcome.batchId}\``,
    `- Batch Run ID: \`${outcome.batchRunId}\``,
    `- Phase: \`${outcome.phase}\``,
    `- Territory: \`${outcome.territory}\``,
    `- Import run mode: \`${outcome.importRunMode}\` (seeding | maintenance; env \`COURSE_IMPORT_RUN_MODE\` or \`--mode=\`)`,
    `- Dry run: \`${dryRun}\``,
    `- Discovered candidates: \`${outcome.discoveredCandidates}\``,
    `- Attempted candidates: \`${outcome.attemptedCandidates}\``,
    `- Inserted courses: \`${outcome.insertedCourses}\``,
    `- Rejected courses (low confidence): \`${Number((outcome.report as Record<string, unknown>).rejectedCourses ?? 0)}\``,
    `- Updated courses: \`${outcome.updatedCourses}\``,
    `- OK: \`${ok}\``,
    `- Partial: \`${partial}\``,
    `- Failed (hard): \`${failed}\``,
    `- Skipped: \`${skipped}\``,
    `- Missing SI issue count: \`${outcome.missingSiCount}\``,
    "",
    "## Nightly exit policy",
    `- Process exit code: \`${outcome.nightlyRunExit.exitCode}\` (${outcome.nightlyRunExit.exitReason})`,
    `- Hard failure count: \`${outcome.nightlyRunExit.hardFailureCount}\``,
    `- Unresolved candidate count: \`${outcome.nightlyRunExit.unresolvedCandidateCount}\` (cap \`${outcome.nightlyRunExit.maxUnresolvedOk}\`)`,
    `- Unresolved names: ${outcome.nightlyRunExit.unresolvedCandidateNames.length ? outcome.nightlyRunExit.unresolvedCandidateNames.map((n) => `\`${n}\``).join(", ") : "none"}`,
    `- Exit downgraded to success (bounded unresolved only): \`${outcome.nightlyRunExit.exitDowngradedToSuccess}\``,
    "",
    "## Import breakdown (growth vs refresh vs sweep)",
    "```json",
    `${JSON.stringify(outcome.report.importRunBreakdown, null, 2)}`,
    "```",
    "",
    "## Import pipeline success",
    `- Inserted rows: \`${outcome.insertedCourses}\``,
    `- Updated rows: \`${outcome.updatedCourses}\``,
    `- Skipped rows: \`${skipped}\``,
    "",
    "## Golfer data quality",
    `- Verified courses promoted: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.verifiedCoursesPromoted ?? 0)}\``,
    `- Partial courses staged: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.partialCoursesStaged ?? 0)}\``,
    `- Unverified courses staged: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.unverifiedCoursesStaged ?? 0)}\``,
    `- Rejected courses: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.rejectedCourses ?? 0)}\``,
    `- Courses with missing SI: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.coursesWithMissingSI ?? 0)}\``,
    `- Courses with missing yardage: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.coursesWithMissingYardage ?? 0)}\``,
    `- Courses with zero complete tees: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.coursesWithZeroCompleteTees ?? 0)}\``,
    `- Courses inserted but not golfer-ready: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.coursesInsertedButNotGolferReady ?? 0)}\``,
    `- Unverified: needs official confirmation: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.unverifiedNeedsOfficialConfirmation ?? 0)}\``,
    `- Unverified: incomplete hole data: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.unverifiedIncompleteHoleData ?? 0)}\``,
    `- Unverified: ambiguous match: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.unverifiedAmbiguousMatch ?? 0)}\``,
    `- Unverified: official parse failed: \`${Number(((outcome.report as Record<string, unknown>).golferDataQualitySummary as Record<string, unknown> | undefined)?.unverifiedParseFailed ?? 0)}\``,
    "",
    "## Priority course promotion audit",
    "```json",
    `${JSON.stringify((outcome.report as Record<string, unknown>).priorityCoursePromotionReport ?? [], null, 2)}`,
    "```",
    "",
    "## priorityCoursesReadyForOfficialConfirmation",
    "```json",
    `${JSON.stringify((outcome.report as Record<string, unknown>).priorityCoursesReadyForOfficialConfirmation ?? [], null, 2)}`,
    "```",
    "",
    "## Queue composition by seed phase (DB snapshot at end of run)",
    "Counts are from `course_import_candidates` for this territory. **`queued`** = not yet successfully imported (still eligible for growth discovery).",
    "```json",
    `${JSON.stringify(outcome.queueCompositionBySeedPhase, null, 2)}`,
    "```",
    "",
    "## Import yield by work phase (this batch)",
    "`importYieldPct` = new course rows inserted ÷ API attempts in that work phase. **`unresolved`** = skipped with unresolved API id match.",
    "```json",
    `${JSON.stringify(outcome.importYieldByWorkPhase, null, 2)}`,
    "```",
    "",
    "## New-course growth: conversion & waste (growth phase only)",
    "Distinguishes **net-new** `courses` rows from **updates** to existing rows, and skip reasons (ambiguous / no catalog / low score). `notNetNew` segments duplicate-style work: DB/alias path vs search that still deduped to an existing course.",
    "```json",
    `${JSON.stringify(outcome.newCourseGrowthWaste, null, 2)}`,
    "```",
    "",
    "## Catalog freshness",
    `- Full stale sweep: \`${outcome.catalogFreshness.triggeredFullRefresh}\``,
    `- Reasons: ${outcome.catalogFreshness.reasons.map((r) => r.replace(/`/g, "'")).join("; ") || "none"}`,
    `- Stale sweep skip reason: \`${outcome.skippedStaleCatalogSweepReason ?? "none"}\` | queued after phases: \`${outcome.queuedCandidatesAfterCandidatePhases}\``,
    `- New growth phase: attempted \`${outcome.newCourseGrowthSummary.attempted}\`, inserted \`${outcome.newCourseGrowthSummary.inserted}\`, updated \`${outcome.newCourseGrowthSummary.updated}\``,
    `- Stale candidate refresh: attempted \`${outcome.staleCandidateRefreshSummary.attempted}\`, inserted \`${outcome.staleCandidateRefreshSummary.inserted}\`, updated \`${outcome.staleCandidateRefreshSummary.updated}\``,
    `- Stale catalog sweep: attempted \`${outcome.staleCatalogSweep?.attempted ?? 0}\` (ok \`${outcome.staleCatalogSweep?.ok ?? 0}\`, partial \`${outcome.staleCatalogSweep?.partial ?? 0}\`, failed \`${outcome.staleCatalogSweep?.failed ?? 0}\`)`,
    "",
    "## Top Failure Reasons",
    ...(outcome.topFailureReasons.length
      ? outcome.topFailureReasons.map((row) => `- ${row.reason} (\`${row.count}\`)`)
      : ["- none"]),
    "",
    "## Manual Review Items",
    ...(outcome.manualReviewItems.length
      ? outcome.manualReviewItems.map((row) => `- ${row.courseName}: ${row.status} - ${row.reason}`)
      : ["- none"]),
    "",
  ];
  await writeFile(mdPath, mdLines.join("\n"), "utf8");
  console.log("[course-import-nightly] report-json:", jsonPath);
  console.log("[course-import-nightly] report-md:", mdPath);

  process.exitCode = outcome.nightlyRunExit.exitCode;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[course-import-nightly] fatal:", message);
  const territoryArg = process.argv.find((arg) => arg.startsWith("--territory="));
  const phaseArg = process.argv.find((arg) => arg.startsWith("--phase="));
  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
  void writeFatalReport(error, {
    argv: process.argv.slice(2),
    triggerType: hasArg("--manual") ? "manual" : "nightly",
    modeArg: modeArg ?? process.env.COURSE_IMPORT_RUN_MODE ?? null,
    territoryArg: territoryArg ?? null,
    phaseArg: phaseArg ?? process.env.COURSE_IMPORT_ACTIVE_PHASE ?? null,
    env: {
      COURSE_IMPORT_RUN_MODE: process.env.COURSE_IMPORT_RUN_MODE ?? null,
      COURSE_IMPORT_ACTIVE_PHASE: process.env.COURSE_IMPORT_ACTIVE_PHASE ?? null,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "[set]" : "[missing]",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "[set]" : "[missing]",
      GOLFCOURSE_API_KEY: process.env.GOLFCOURSE_API_KEY ? "[set]" : "[missing]",
    },
  })
    .catch((reportError) => {
      console.error(
        "[course-import-nightly] failed to write fatal report:",
        reportError instanceof Error ? reportError.message : String(reportError),
      );
    })
    .finally(() => {
      process.exit(1);
    });
});
