/**
 * Course import job queue: enqueue, fetch pending, update status.
 * Used by on-demand seeding and background worker.
 * Enqueue uses anon client; claim/complete/fail use service role when available.
 */
import { supabase } from "@/lib/supabase";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isValidUuid } from "@/lib/uuid";

function getClient() {
  return getSupabaseServer() ?? supabase;
}

export type JobType = "import_holes" | "dedupe_course" | "refresh_course";
export type JobStatus = "pending" | "running" | "completed" | "failed";

export type CourseImportJob = {
  id: string;
  course_id: string;
  job_type: JobType;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const MAX_ATTEMPTS = 3;

/**
 * Enqueue a job. Skips if identical pending job exists (unique index).
 */
export async function enqueueCourseImportJob(
  courseId: string,
  jobType: JobType,
  payload?: Record<string, unknown>
): Promise<CourseImportJob | null> {
  if (!isValidUuid(courseId)) {
    console.warn("[courseImportJobs] enqueue: invalid courseId", courseId);
    return null;
  }

  const { data, error } = await supabase
    .from("course_import_jobs")
    .insert({
      course_id: courseId,
      job_type: jobType,
      status: "pending",
      attempts: 0,
      max_attempts: MAX_ATTEMPTS,
      payload: payload ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      console.log("[courseImportJobs] enqueue: duplicate pending job skipped", { courseId, jobType });
      return null;
    }
    console.error("[courseImportJobs] enqueue failed:", error.message);
    return null;
  }

  console.log("[courseImportJobs] enqueued", { id: data?.id, courseId, jobType });
  return data as CourseImportJob;
}

/**
 * Enqueue import_holes and optionally refresh_course after on-demand seed.
 */
export async function enqueueEnrichmentJobs(courseId: string): Promise<void> {
  await enqueueCourseImportJob(courseId, "import_holes");
  await enqueueCourseImportJob(courseId, "refresh_course");
}

/**
 * Fetch next batch of pending jobs (oldest first). Uses advisory lock pattern:
 * update status to 'running' and return. Caller processes then updates to completed/failed.
 * Requires service role for update; falls back to anon (may fail on RLS).
 */
export async function claimPendingJobs(limit = 5): Promise<CourseImportJob[]> {
  const client = getClient();
  const { data: pending, error: fetchErr } = await client
    .from("course_import_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit * 2);

  if (fetchErr) {
    console.error("[courseImportJobs] claimPendingJobs fetch failed:", fetchErr.message);
    return [];
  }

  const jobs = ((pending ?? []) as CourseImportJob[])
    .filter((j) => j.attempts < (j.max_attempts ?? MAX_ATTEMPTS))
    .slice(0, limit);
  const claimed: CourseImportJob[] = [];

  for (const job of jobs) {

    const { data: updated, error: updateErr } = await client
      .from("course_import_jobs")
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
      claimed.push(updated as CourseImportJob);
    }
  }

  return claimed;
}

/**
 * Mark job as completed.
 */
export async function completeJob(jobId: string): Promise<void> {
  const client = getClient();
  const { error } = await client
    .from("course_import_jobs")
    .update({
      status: "completed",
      last_error: null,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error("[courseImportJobs] completeJob failed:", jobId, error.message);
  }
}

/**
 * Mark job as failed. Increments attempts; if at max, status stays failed.
 */
export async function failJob(jobId: string, errMessage: string): Promise<void> {
  const client = getClient();
  const { data: job } = await client
    .from("course_import_jobs")
    .select("attempts, max_attempts")
    .eq("id", jobId)
    .single();

  const attempts = (job as any)?.attempts ?? 0;
  const maxAttempts = (job as any)?.max_attempts ?? MAX_ATTEMPTS;
  const isFinal = attempts >= maxAttempts;

  const { error } = await client
    .from("course_import_jobs")
    .update({
      status: isFinal ? "failed" : "pending",
      last_error: errMessage,
      updated_at: new Date().toISOString(),
      completed_at: isFinal ? new Date().toISOString() : null,
    })
    .eq("id", jobId);

  if (error) {
    console.error("[courseImportJobs] failJob failed:", jobId, error.message);
  }
}
