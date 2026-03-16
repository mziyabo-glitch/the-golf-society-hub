/**
 * Background worker for course import jobs.
 * Processes: import_holes, dedupe_course, refresh_course.
 * Uses service role for job claim/complete/fail.
 */
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  claimPendingJobs,
  completeJob,
  failJob,
  type CourseImportJob,
  type JobType,
} from "@/lib/courseImportJobs";
import { getCourseById, type ApiCourse, type ApiTee } from "@/lib/golfApi";
import { upsertTeesFromApi } from "@/lib/db_supabase/courseRepo";
import { isValidUuid } from "@/lib/uuid";

const supabase = () => getSupabaseServer();

/**
 * Process import_holes: fetch course from API, import holes for tees that lack them.
 * Skips tees with is_manual_override = true.
 */
async function processImportHoles(job: CourseImportJob): Promise<void> {
  const courseId = job.course_id;
  if (!isValidUuid(courseId)) throw new Error("Invalid course_id");

  const sb = supabase();
  if (!sb) throw new Error("Supabase server client not available");

  const { data: course, error: courseErr } = await sb
    .from("courses")
    .select("id, api_id, course_name")
    .eq("id", courseId)
    .single();

  if (courseErr || !course) {
    throw new Error(`Course not found: ${courseErr?.message ?? "no data"}`);
  }

  const apiId = course.api_id != null ? Number(course.api_id) : null;
  if (apiId == null || !Number.isFinite(apiId)) {
    console.log("[courseEnrichmentWorker] import_holes: no api_id, skipping");
    return;
  }

  const apiCourse: ApiCourse = await getCourseById(apiId);
  const mergedTees: ApiTee[] = Array.isArray(apiCourse.tees)
    ? apiCourse.tees
    : [
        ...((apiCourse.tees as { male?: ApiTee[] })?.male ?? []).map((t) => ({ ...t, gender: "M" as const })),
        ...((apiCourse.tees as { female?: ApiTee[] })?.female ?? []).map((t) => ({ ...t, gender: "F" as const })),
      ];

  const { data: existingTees } = await sb
    .from("course_tees")
    .select("id, tee_name, is_manual_override")
    .eq("course_id", courseId);

  const manualOverrideNames = new Set(
    (existingTees ?? []).filter((t: any) => t.is_manual_override === true).map((t: any) => (t.tee_name || "").toLowerCase())
  );

  const teesToImport = mergedTees.filter((t) => {
    const name = (t.tee_name ?? t.name ?? "").trim().toLowerCase();
    return name && !manualOverrideNames.has(name);
  });

  if (teesToImport.length === 0) {
    console.log("[courseEnrichmentWorker] import_holes: all tees are manual override, skipping");
    return;
  }

  await importHolesForTees(sb, courseId, teesToImport, apiCourse);
  await updateEnrichmentStatus(sb, courseId, "holes_loaded");
}

async function importHolesForTees(
  sb: ReturnType<typeof supabase>,
  courseId: string,
  tees: ApiTee[],
  apiCourse: ApiCourse
): Promise<void> {
  if (!sb) return;

  const { data: existingTees } = await sb
    .from("course_tees")
    .select("id, tee_name")
    .eq("course_id", courseId);

  const teeNameToId = new Map<string, string>((existingTees ?? []).map((t: any) => [t.tee_name, t.id]));

  for (const tee of tees) {
    const teeName = (tee.tee_name ?? tee.name ?? "").trim();
    if (!teeName) continue;

    const teeId = teeNameToId.get(teeName);
    if (!teeId) continue;

    const holes = tee.holes ?? [];
    if (holes.length === 0) continue;

    const { data: existingHoles } = await sb
      .from("course_holes")
      .select("hole_number")
      .eq("tee_id", teeId);

    const existingNums = new Set((existingHoles ?? []).map((h: any) => h.hole_number));

    const rows = holes
      .map((h: any, i: number) => {
        const holeNum = (h.hole_number ?? h.number ?? i + 1) as number;
        if (existingNums.has(holeNum)) return null;
        return {
          course_id: courseId,
          tee_id: teeId,
          hole_number: holeNum,
          par: h.par != null ? Number(h.par) : null,
          yardage: h.yardage ?? h.yards != null ? Number(h.yardage ?? h.yards) : null,
          stroke_index: h.stroke_index ?? h.handicap ?? h.hcp ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null && Number.isFinite(r.hole_number));

    if (rows.length === 0) continue;

    const { error } = await sb.from("course_holes").upsert(rows, { onConflict: "tee_id,hole_number" });
    if (error) {
      console.warn("[courseEnrichmentWorker] holes upsert failed:", teeName, error.message);
    }
  }
}

/**
 * Process dedupe_course: mark as verified. Full merge (moving tees) is complex
 * due to event references; deduplication at import time (api_id, normalized_name) is primary.
 */
async function processDedupeCourse(job: CourseImportJob): Promise<void> {
  const courseId = job.course_id;
  if (!isValidUuid(courseId)) throw new Error("Invalid course_id");

  const sb = supabase();
  if (!sb) throw new Error("Supabase server client not available");

  const { data: course, error } = await sb
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .single();

  if (error || !course) {
    throw new Error(`Course not found: ${error?.message ?? "no data"}`);
  }

  await updateEnrichmentStatus(sb, courseId, "verified");
}

/**
 * Process refresh_course: re-fetch from API, update tees (skip is_manual_override).
 */
async function processRefreshCourse(job: CourseImportJob): Promise<void> {
  const courseId = job.course_id;
  if (!isValidUuid(courseId)) throw new Error("Invalid course_id");

  const sb = supabase();
  if (!sb) throw new Error("Supabase server client not available");

  const { data: course, error } = await sb
    .from("courses")
    .select("id, api_id")
    .eq("id", courseId)
    .single();

  if (error || !course) {
    throw new Error(`Course not found: ${error?.message ?? "no data"}`);
  }

  const apiId = course.api_id != null ? Number(course.api_id) : null;
  if (apiId == null || !Number.isFinite(apiId)) {
    console.log("[courseEnrichmentWorker] refresh_course: no api_id");
    return;
  }

  const apiCourse = await getCourseById(apiId);
  const { data: existingTees } = await sb
    .from("course_tees")
    .select("id, tee_name, is_manual_override")
    .eq("course_id", courseId);

  const manualNames = new Set(
    (existingTees ?? []).filter((t: any) => t.is_manual_override === true).map((t: any) => (t.tee_name || "").toLowerCase())
  );

  const flatTees = Array.isArray(apiCourse.tees)
    ? apiCourse.tees
    : [
        ...((apiCourse.tees as { male?: ApiTee[] })?.male ?? []).map((t) => ({ ...t, gender: "M" as const })),
        ...((apiCourse.tees as { female?: ApiTee[] })?.female ?? []).map((t) => ({ ...t, gender: "F" as const })),
      ];

  const toUpsert = flatTees.filter((t) => {
    const name = (t.tee_name ?? t.name ?? "").trim().toLowerCase();
    return name && !manualNames.has(name);
  });

  if (toUpsert.length > 0) {
    await upsertTeesFromApi(courseId, toUpsert as any);
  }

  await updateEnrichmentStatus(sb, courseId, "tees_loaded");
}

async function updateEnrichmentStatus(
  sb: NonNullable<ReturnType<typeof supabase>>,
  courseId: string,
  status: "seeded" | "tees_loaded" | "holes_loaded" | "verified"
): Promise<void> {
  await sb
    .from("courses")
    .update({
      enrichment_status: status,
      enrichment_updated_at: new Date().toISOString(),
    })
    .eq("id", courseId);
}

const processors: Record<JobType, (job: CourseImportJob) => Promise<void>> = {
  import_holes: processImportHoles,
  dedupe_course: processDedupeCourse,
  refresh_course: processRefreshCourse,
};

/**
 * Process one job. Uses service role for claim/complete/fail.
 */
export async function processOneJob(job: CourseImportJob): Promise<boolean> {
  const fn = processors[job.job_type];
  if (!fn) {
    console.warn("[courseEnrichmentWorker] unknown job_type:", job.job_type);
    return false;
  }

  try {
    await fn(job);
    await completeJob(job.id);
    console.log("[courseEnrichmentWorker] completed", job.job_type, job.course_id);
    return true;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    await failJob(job.id, msg);
    console.error("[courseEnrichmentWorker] failed", job.job_type, job.course_id, msg);
    return false;
  }
}

/**
 * Run worker: claim pending jobs, process each.
 */
export async function runWorker(limit = 5): Promise<{ processed: number; succeeded: number }> {
  const sb = getSupabaseServer();
  if (!sb) {
    console.warn("[courseEnrichmentWorker] Supabase server client not available");
    return { processed: 0, succeeded: 0 };
  }

  const jobs = await claimPendingJobs(limit);
  let succeeded = 0;

  for (const job of jobs) {
    const ok = await processOneJob(job);
    if (ok) succeeded++;
  }

  return { processed: jobs.length, succeeded };
}
