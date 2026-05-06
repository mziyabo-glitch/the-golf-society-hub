import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

import { runUkGolfApiOsmHoleGridSeed } from "./seed-uk-golf-queue-from-osm-holes";
import { runUkGolfApiSeedQueue } from "./uk-golf-api-seed-queue";
import { emptyProcessSummary, runUkGolfApiProcessQueue, type ProcessSummary } from "./uk-golf-api-process-queue";

dotenv.config();

const REPORT_DIR = resolvePath(process.cwd(), "reports", "nightly-course-import");
const SUMMARY_JSON = resolvePath(REPORT_DIR, "nightly-summary.json");
const SUMMARY_MD = resolvePath(REPORT_DIR, "nightly-summary.md");

type SeedQueueSummary = Awaited<ReturnType<typeof runUkGolfApiSeedQueue>>;
type GbSeedSummary = Awaited<ReturnType<typeof runUkGolfApiOsmHoleGridSeed>>;

type NightlyReportV1 = {
  version: 1;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  fatalError: string | null;
  seedQueue: SeedQueueSummary | null;
  gbSeed: GbSeedSummary | null;
  processQueue: ProcessSummary | null;
};

function formatMd(report: NightlyReportV1): string {
  const p = report.processQueue ?? emptyProcessSummary("queue_empty");
  const lines: string[] = [
    "# Nightly course import (UK Golf API)",
    "",
    `- **Started:** ${report.startedAt}`,
    `- **Finished:** ${report.finishedAt}`,
    `- **Duration:** ${report.durationMs} ms (${(report.durationMs / 1000).toFixed(1)} s)`,
  ];
  if (report.fatalError) {
    lines.push(`- **Fatal error:** \`${report.fatalError.replace(/`/g, "'")}\``);
  }
  lines.push("", "## Curated seed queue (`territory-seed-candidates.uk.json`)");
  if (report.seedQueue) {
    lines.push(
      `- inserted: ${report.seedQueue.inserted}`,
      `- skippedExisting: ${report.seedQueue.skippedExisting}`,
      `- byTerritory: \`${JSON.stringify(report.seedQueue.byTerritory)}\``,
    );
  } else {
    lines.push("- *(not run — earlier failure)*");
  }
  lines.push("", "## GB JSON seed (`datasets/osm/gb.json`)");
  if (report.gbSeed) {
    lines.push(
      `- clusters (source rows): ${report.gbSeed.clusters}`,
      `- uniqueCandidates: ${report.gbSeed.candidates}`,
      `- inserted: ${report.gbSeed.inserted}`,
      `- skippedExisting: ${report.gbSeed.skippedExisting}`,
      `- byTerritory: \`${JSON.stringify(report.gbSeed.byTerritory)}\``,
    );
  } else {
    lines.push("- *(not run — earlier failure)*");
  }
  lines.push(
    "",
    "## UK Golf API process queue",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| processedThisRun | ${p.processedThisRun} |`,
    `| successfulItems | ${p.successfulItems} |`,
    `| failedItems | ${p.failedItems} |`,
    `| stagedCourses | ${p.stagedCourses} |`,
    `| stagedTees | ${p.stagedTees} |`,
    `| stagedHoles | ${p.stagedHoles} |`,
    `| queuePending (+ rate_limited) | ${p.queuePending} |`,
    `| queueStaged | ${p.queueStaged} |`,
    `| queuePartial | ${p.queuePartial} |`,
    `| queueFailed | ${p.queueFailed} |`,
    `| requestsMade | ${p.requestsMade} |`,
    `| rateLimitEvents | ${p.rateLimitEvents} |`,
    `| retries | ${p.retries} |`,
    `| fallbackDiscoveryCalls | ${p.fallbackDiscoveryCalls} |`,
    `| **stoppedReason** | **${p.stoppedReason}** |`,
    "",
  );
  return lines.join("\n");
}

async function writeNightlyReports(report: NightlyReportV1): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(SUMMARY_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(SUMMARY_MD, `${formatMd(report)}\n`, "utf8");
  console.log(`[course-import-nightly] wrote ${SUMMARY_JSON}`);
  console.log(`[course-import-nightly] wrote ${SUMMARY_MD}`);
}

async function main(): Promise<void> {
  if (process.env.UK_GOLF_API_ALLOW_LIVE_PROMOTION === "true") {
    console.warn(
      "[course-import-nightly] UK_GOLF_API_ALLOW_LIVE_PROMOTION=true detected; nightly-course-import is staging-only and will not promote.",
    );
  }

  await mkdir(REPORT_DIR, { recursive: true });

  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  let seedQueue: SeedQueueSummary | null = null;
  let gbSeed: GbSeedSummary | null = null;
  let processQueue: ProcessSummary | null = null;
  let fatalError: string | null = null;

  try {
    seedQueue = await runUkGolfApiSeedQueue();
    console.log("[uk-golf-api:seed-queue]", seedQueue);

    gbSeed = await runUkGolfApiOsmHoleGridSeed();
    console.log("[uk-golf-api:gb-json-seed]", gbSeed);

    processQueue = await runUkGolfApiProcessQueue();
    console.log("[uk-golf-api:nightly-summary]");
    console.log(JSON.stringify(processQueue, null, 2));
  } catch (error: unknown) {
    fatalError = error instanceof Error ? error.message : String(error);
    console.error("[course-import-nightly] fatal:", fatalError);
    if (!processQueue) {
      processQueue = emptyProcessSummary("queue_empty");
    }
  } finally {
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - t0);
    try {
      await writeNightlyReports({
        version: 1,
        startedAt,
        finishedAt,
        durationMs,
        fatalError,
        seedQueue,
        gbSeed,
        processQueue: processQueue ?? emptyProcessSummary("queue_empty"),
      });
    } catch (reportErr) {
      console.error("[course-import-nightly] failed to write reports:", reportErr);
    }
  }

  if (fatalError) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[course-import-nightly] fatal (outer):", message);
  const finishedAt = new Date().toISOString();
  try {
    await writeNightlyReports({
      version: 1,
      startedAt: finishedAt,
      finishedAt,
      durationMs: 0,
      fatalError: message,
      seedQueue: null,
      gbSeed: null,
      processQueue: emptyProcessSummary("queue_empty"),
    });
  } catch (writeErr) {
    console.error("[course-import-nightly] failed to write reports:", writeErr);
  }
  process.exit(1);
});
