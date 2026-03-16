/**
 * Decoupled background sync jobs: enqueue on live API fetch, process async.
 * UI never blocks; sync grows local course library.
 */
import { supabase } from "@/lib/supabase";
import { getSupabaseServer } from "@/lib/supabase-server";

export type SyncJobType = "sync_course" | "sync_tees" | "sync_holes";
export type SyncJobStatus = "pending" | "running" | "completed" | "failed";

export type CourseSyncJob = {
  id: string;
  api_id: number;
  course_name: string | null;
  local_course_id: string | null;
  job_type: SyncJobType;
  status: SyncJobStatus;
  payload: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const MAX_ATTEMPTS = 3;

function getClient() {
  return getSupabaseServer() ?? supabase;
}

/**
 * Enqueue a sync job when live API returns valid course data.
 * Fire-and-forget: never blocks UI. Skips if duplicate pending exists.
 */
export async function enqueueCourseSyncJob(opts: {
  api_id: number;
  course_name?: string;
  job_type?: SyncJobType;
  payload?: Record<string, unknown>;
}): Promise<CourseSyncJob | null> {
  const { api_id, course_name, job_type = "sync_course", payload } = opts;

  if (!Number.isFinite(api_id)) {
    console.warn("[courseSyncJobs] enqueue: invalid api_id", api_id);
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("course_sync_jobs")
      .insert({
        api_id,
        course_name: course_name ?? null,
        local_course_id: null,
        job_type,
        status: "pending",
        payload: payload ?? null,
        attempts: 0,
        max_attempts: MAX_ATTEMPTS,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        console.log("[courseSyncJobs] enqueue: duplicate pending skipped", { api_id });
        return null;
      }
      console.warn("[courseSyncJobs] enqueue failed:", error.message);
      return null;
    }

    console.log("[courseSyncJobs] sync job enqueued", { id: data?.id, api_id, job_type });
    return data as CourseSyncJob;
  } catch (err) {
    console.warn("[courseSyncJobs] enqueue error:", (err as Error)?.message);
    return null;
  }
}

/**
 * Claim pending jobs for processing. Uses service role.
 */
export async function claimPendingSyncJobs(limit = 5): Promise<CourseSyncJob[]> {
  const client = getClient();

  const { data: pending, error: fetchErr } = await client
    .from("course_sync_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit * 2);

  if (fetchErr) {
    console.error("[courseSyncJobs] claim fetch failed:", fetchErr.message);
    return [];
  }

  const jobs = ((pending ?? []) as CourseSyncJob[])
    .filter((j) => j.attempts < (j.max_attempts ?? MAX_ATTEMPTS))
    .slice(0, limit);
  const claimed: CourseSyncJob[] = [];

  for (const job of jobs) {
    const { data: updated, error: updateErr } = await client
      .from("course_sync_jobs")
      .update({
        status: "running",
        attempts: job.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .select()
      .single();

    if (!updateErr && updated) {
      claimed.push(updated as CourseSyncJob);
    }
  }

  return claimed;
}

export async function completeSyncJob(jobId: string): Promise<void> {
  const client = getClient();
  const { error } = await client
    .from("course_sync_jobs")
    .update({
      status: "completed",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error("[courseSyncJobs] completeSyncJob failed:", jobId, error.message);
  }
}

export async function failSyncJob(jobId: string, errMessage: string): Promise<void> {
  const client = getClient();
  const { data: job } = await client
    .from("course_sync_jobs")
    .select("attempts, max_attempts")
    .eq("id", jobId)
    .single();

  const attempts = (job as any)?.attempts ?? 0;
  const maxAttempts = (job as any)?.max_attempts ?? MAX_ATTEMPTS;
  const isFinal = attempts >= maxAttempts;

  const { error } = await client
    .from("course_sync_jobs")
    .update({
      status: isFinal ? "failed" : "pending",
      last_error: errMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error("[courseSyncJobs] failSyncJob failed:", jobId, error.message);
  }
}
