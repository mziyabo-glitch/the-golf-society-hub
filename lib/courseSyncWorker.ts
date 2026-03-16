/**
 * Background sync worker: process course_sync_jobs.
 * Resolves canonical course, upserts safely, preserves manual overrides.
 */
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  claimPendingSyncJobs,
  completeSyncJob,
  failSyncJob,
  type CourseSyncJob,
  type SyncJobType,
} from "@/lib/courseSyncJobs";
import { parseApiCourseFromRaw } from "@/lib/golfApi";
import { importCourse } from "@/lib/importCourse";

const sb = () => getSupabaseServer();

/**
 * Process sync_course: parse payload, resolve canonical course, upsert course+tees+holes.
 */
async function processSyncCourse(job: CourseSyncJob): Promise<void> {
  const payload = job.payload;
  if (!payload || typeof payload !== "object") {
    throw new Error("Missing or invalid payload");
  }

  const apiCourse = parseApiCourseFromRaw(payload, job.api_id);
  if (!apiCourse) {
    throw new Error("Failed to parse API payload");
  }

  console.log("[courseSyncWorker] sync job processed", {
    api_id: job.api_id,
    course_name: apiCourse.name,
  });

  await importCourse(apiCourse);

  console.log("[courseSyncWorker] sync_course completed", {
    api_id: job.api_id,
    course_inserted_or_reused: true,
  });
}

/**
 * Process sync_tees: same as sync_course for now (full sync).
 */
async function processSyncTees(job: CourseSyncJob): Promise<void> {
  await processSyncCourse(job);
}

/**
 * Process sync_holes: full sync (course + tees + holes).
 */
async function processSyncHoles(job: CourseSyncJob): Promise<void> {
  await processSyncCourse(job);
}

const processors: Record<SyncJobType, (job: CourseSyncJob) => Promise<void>> = {
  sync_course: processSyncCourse,
  sync_tees: processSyncTees,
  sync_holes: processSyncHoles,
};

export async function processOneSyncJob(job: CourseSyncJob): Promise<boolean> {
  const fn = processors[job.job_type];
  if (!fn) {
    console.warn("[courseSyncWorker] unknown job_type:", job.job_type);
    return false;
  }

  try {
    await fn(job);
    await completeSyncJob(job.id);
    console.log("[courseSyncWorker] job completed", job.job_type, job.api_id);
    return true;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    await failSyncJob(job.id, msg);
    console.error("[courseSyncWorker] job failed", job.job_type, job.api_id, msg);
    return false;
  }
}

export async function runSyncWorker(limit = 5): Promise<{ processed: number; succeeded: number }> {
  const client = sb();
  if (!client) {
    console.warn("[courseSyncWorker] Supabase server client not available");
    return { processed: 0, succeeded: 0 };
  }

  const jobs = await claimPendingSyncJobs(limit);
  let succeeded = 0;

  for (const job of jobs) {
    const ok = await processOneSyncJob(job);
    if (ok) succeeded++;
  }

  return { processed: jobs.length, succeeded };
}
