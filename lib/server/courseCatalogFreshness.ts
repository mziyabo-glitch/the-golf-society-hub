import type { SupabaseClient } from "@supabase/supabase-js";

export type CourseCatalogFreshnessThresholds = {
  staleAgeDays: number;
  minStaleCoursesToTrigger: number;
  minCoursesWithMissingStrokeIndexToTrigger: number;
  minCoursesWithIncompleteTeeBlockToTrigger: number;
  /** When set (e.g. 0.12), also trigger if staleByLastSyncedCount / coursesWithApiId >= this value. */
  staleFractionTrigger: number | null;
  staleSweepMaxCourses: number;
};

export type CourseCatalogFreshnessMetrics = {
  evaluatedAtIso: string;
  staleAgeCutoffIso: string;
  coursesWithApiId: number;
  staleByLastSyncedCount: number;
  coursesWithMissingStrokeIndex: number;
  coursesWithIncompleteTeeBlock: number;
};

export type CourseCatalogFreshnessReport = {
  triggeredFullRefresh: boolean;
  reasons: string[];
  metrics: CourseCatalogFreshnessMetrics;
  thresholds: CourseCatalogFreshnessThresholds;
};

export type StaleCatalogCourseRow = {
  courseId: string;
  apiId: number;
  courseName: string;
};

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function parseOptionalFractionEnv(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return null;
  return n;
}

function isFullRefreshForcedFromEnv(): boolean {
  const v = process.env.COURSE_IMPORT_FULL_REFRESH_FORCE?.trim();
  return v === "1" || v === "true" || v === "yes";
}

export function getCourseCatalogFreshnessThresholdsFromEnv(
  overrides?: Partial<CourseCatalogFreshnessThresholds>,
): CourseCatalogFreshnessThresholds {
  return {
    staleAgeDays: overrides?.staleAgeDays ?? parsePositiveIntEnv("COURSE_IMPORT_STALE_AGE_DAYS", 45),
    minStaleCoursesToTrigger:
      overrides?.minStaleCoursesToTrigger ?? parsePositiveIntEnv("COURSE_IMPORT_FULL_REFRESH_MIN_STALE", 8),
    minCoursesWithMissingStrokeIndexToTrigger:
      overrides?.minCoursesWithMissingStrokeIndexToTrigger ??
      parsePositiveIntEnv("COURSE_IMPORT_FULL_REFRESH_MIN_MISSING_SI_COURSES", 5),
    minCoursesWithIncompleteTeeBlockToTrigger:
      overrides?.minCoursesWithIncompleteTeeBlockToTrigger ??
      parsePositiveIntEnv("COURSE_IMPORT_FULL_REFRESH_MIN_INCOMPLETE_TEE_COURSES", 5),
    staleFractionTrigger: overrides?.staleFractionTrigger ?? parseOptionalFractionEnv("COURSE_IMPORT_FULL_REFRESH_STALE_FRACTION"),
    staleSweepMaxCourses:
      overrides?.staleSweepMaxCourses ?? parsePositiveIntEnv("COURSE_IMPORT_STALE_SWEEP_MAX_COURSES", 25),
  };
}

export function decideCatalogFullRefresh(
  metrics: CourseCatalogFreshnessMetrics,
  thresholds: CourseCatalogFreshnessThresholds,
  opts?: { force?: boolean },
): { triggered: boolean; reasons: string[] } {
  if (opts?.force) {
    return { triggered: true, reasons: ["forced via import run options (forceCatalogFullRefresh)"] };
  }
  if (isFullRefreshForcedFromEnv()) {
    return { triggered: true, reasons: ["COURSE_IMPORT_FULL_REFRESH_FORCE is set in the environment"] };
  }
  const reasons: string[] = [];
  if (metrics.staleByLastSyncedCount >= thresholds.minStaleCoursesToTrigger) {
    reasons.push(
      `staleByLastSyncedCount (${metrics.staleByLastSyncedCount}) >= minStaleCoursesToTrigger (${thresholds.minStaleCoursesToTrigger})`,
    );
  }
  if (metrics.coursesWithMissingStrokeIndex >= thresholds.minCoursesWithMissingStrokeIndexToTrigger) {
    reasons.push(
      `coursesWithMissingStrokeIndex (${metrics.coursesWithMissingStrokeIndex}) >= threshold (${thresholds.minCoursesWithMissingStrokeIndexToTrigger})`,
    );
  }
  if (metrics.coursesWithIncompleteTeeBlock >= thresholds.minCoursesWithIncompleteTeeBlockToTrigger) {
    reasons.push(
      `coursesWithIncompleteTeeBlock (${metrics.coursesWithIncompleteTeeBlock}) >= threshold (${thresholds.minCoursesWithIncompleteTeeBlockToTrigger})`,
    );
  }
  if (
    thresholds.staleFractionTrigger != null &&
    metrics.coursesWithApiId > 0 &&
    metrics.staleByLastSyncedCount / metrics.coursesWithApiId >= thresholds.staleFractionTrigger
  ) {
    reasons.push(
      `stale fraction ${(metrics.staleByLastSyncedCount / metrics.coursesWithApiId).toFixed(3)} >= ${thresholds.staleFractionTrigger}`,
    );
  }
  return { triggered: reasons.length > 0, reasons };
}

async function countCoursesWithApiId(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("courses")
    .select("id", { count: "exact", head: true })
    .not("api_id", "is", null);
  if (error) throw new Error(error.message || "Failed to count courses with api_id.");
  return count ?? 0;
}

async function countStaleCoursesByLastSynced(supabase: SupabaseClient, staleAgeCutoffIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("courses")
    .select("id", { count: "exact", head: true })
    .not("api_id", "is", null)
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleAgeCutoffIso}`);
  if (error) throw new Error(error.message || "Failed to count stale courses.");
  return count ?? 0;
}

/**
 * Distinct courses (with api_id) that have at least one hole row missing stroke_index.
 * Uses a bounded scan of hole rows for efficiency on large catalogs.
 */
async function countCoursesWithMissingStrokeIndex(supabase: SupabaseClient, holeScanLimit: number): Promise<number> {
  const { data, error } = await supabase.from("course_holes").select("course_id").is("stroke_index", null).limit(holeScanLimit);
  if (error) throw new Error(error.message || "Failed to scan holes missing stroke_index.");
  const courseIds = [...new Set((data ?? []).map((r: { course_id: string }) => r.course_id))];
  if (courseIds.length === 0) return 0;
  let withApi = 0;
  const chunk = 150;
  for (let i = 0; i < courseIds.length; i += chunk) {
    const slice = courseIds.slice(i, i + chunk);
    const { data: rows, error: cErr } = await supabase
      .from("courses")
      .select("id")
      .in("id", slice)
      .not("api_id", "is", null);
    if (cErr) throw new Error(cErr.message || "Failed to resolve courses for missing SI scan.");
    withApi += (rows ?? []).length;
  }
  return withApi;
}

/**
 * Distinct courses (with api_id) that have at least one active tee missing key numeric fields.
 */
async function countCoursesWithIncompleteTeeBlock(supabase: SupabaseClient, teeScanLimit: number): Promise<number> {
  const { data, error } = await supabase
    .from("course_tees")
    .select("course_id")
    .eq("is_active", true)
    .or("slope_rating.is.null,course_rating.is.null,par_total.is.null,yards.is.null")
    .limit(teeScanLimit);
  if (error) throw new Error(error.message || "Failed to scan incomplete tees.");
  const courseIds = [...new Set((data ?? []).map((r: { course_id: string }) => r.course_id))];
  if (courseIds.length === 0) return 0;
  let withApi = 0;
  const chunk = 150;
  for (let i = 0; i < courseIds.length; i += chunk) {
    const slice = courseIds.slice(i, i + chunk);
    const { data: rows, error: cErr } = await supabase
      .from("courses")
      .select("id")
      .in("id", slice)
      .not("api_id", "is", null);
    if (cErr) throw new Error(cErr.message || "Failed to resolve courses for incomplete tee scan.");
    withApi += (rows ?? []).length;
  }
  return withApi;
}

export async function measureCourseCatalogFreshness(
  supabase: SupabaseClient,
  staleAgeDays: number,
  opts?: { holeScanLimit?: number; teeScanLimit?: number },
): Promise<CourseCatalogFreshnessMetrics> {
  const evaluatedAtIso = new Date().toISOString();
  const cutoff = new Date(Date.now() - staleAgeDays * 86_400_000).toISOString();
  const holeScanLimit = opts?.holeScanLimit ?? 6_000;
  const teeScanLimit = opts?.teeScanLimit ?? 6_000;

  const [coursesWithApiId, staleByLastSyncedCount, coursesWithMissingStrokeIndex, coursesWithIncompleteTeeBlock] =
    await Promise.all([
      countCoursesWithApiId(supabase),
      countStaleCoursesByLastSynced(supabase, cutoff),
      countCoursesWithMissingStrokeIndex(supabase, holeScanLimit),
      countCoursesWithIncompleteTeeBlock(supabase, teeScanLimit),
    ]);

  return {
    evaluatedAtIso,
    staleAgeCutoffIso: cutoff,
    coursesWithApiId,
    staleByLastSyncedCount,
    coursesWithMissingStrokeIndex,
    coursesWithIncompleteTeeBlock,
  };
}

export async function evaluateCourseCatalogFreshness(
  supabase: SupabaseClient,
  thresholds: CourseCatalogFreshnessThresholds,
  opts?: { force?: boolean },
): Promise<CourseCatalogFreshnessReport> {
  const metrics = await measureCourseCatalogFreshness(supabase, thresholds.staleAgeDays);
  const { triggered, reasons } = decideCatalogFullRefresh(metrics, thresholds, opts);
  return {
    triggeredFullRefresh: triggered,
    reasons,
    metrics,
    thresholds,
  };
}

/**
 * Courses to re-pull from GolfCourseAPI with full tee/hole persistence.
 * Ordered: stale-by-age first, then missing stroke index, then incomplete tee block (de-duplicated).
 */
export async function fetchStaleCatalogCoursesForSweep(
  supabase: SupabaseClient,
  params: { maxRows: number; staleAgeDays: number; holeScanLimit?: number; teeScanLimit?: number },
): Promise<StaleCatalogCourseRow[]> {
  const cutoff = new Date(Date.now() - params.staleAgeDays * 86_400_000).toISOString();
  const maxRows = Math.max(1, params.maxRows);
  const seen = new Set<string>();
  const out: StaleCatalogCourseRow[] = [];

  const pushRows = (rows: Array<Record<string, unknown>>): void => {
    for (const row of rows) {
      if (out.length >= maxRows) return;
      const id = String(row.id ?? "");
      const api = row.api_id != null ? Number(row.api_id) : NaN;
      if (!id || !Number.isFinite(api) || api <= 0) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const label = String(row.full_name ?? row.course_name ?? "").trim() || `api:${api}`;
      out.push({ courseId: id, apiId: api, courseName: label });
    }
  };

  const { data: staleAgeRows, error: staleErr } = await supabase
    .from("courses")
    .select("id, api_id, course_name, full_name, last_synced_at")
    .not("api_id", "is", null)
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(maxRows);
  if (staleErr) throw new Error(staleErr.message || "Failed to list stale courses by age.");
  pushRows((staleAgeRows ?? []) as Record<string, unknown>[]);

  if (out.length >= maxRows) return out;

  const holeScanLimit = params.holeScanLimit ?? 6_000;
  const { data: badHoles, error: holeErr } = await supabase
    .from("course_holes")
    .select("course_id")
    .is("stroke_index", null)
    .limit(holeScanLimit);
  if (holeErr) throw new Error(holeErr.message || "Failed to list holes missing stroke_index.");
  const holeCourseIds = [...new Set((badHoles ?? []).map((r: { course_id: string }) => r.course_id))];
  const missingIds = holeCourseIds.filter((id) => !seen.has(id));
  for (let i = 0; i < missingIds.length && out.length < maxRows; i += 120) {
    const slice = missingIds.slice(i, i + 120);
    if (slice.length === 0) break;
    const { data: crs, error: cErr } = await supabase
      .from("courses")
      .select("id, api_id, course_name, full_name")
      .in("id", slice)
      .not("api_id", "is", null);
    if (cErr) throw new Error(cErr.message || "Failed to load courses for missing SI sweep.");
    pushRows((crs ?? []) as Record<string, unknown>[]);
  }

  if (out.length >= maxRows) return out;

  const teeScanLimit = params.teeScanLimit ?? 6_000;
  const { data: badTees, error: teeErr } = await supabase
    .from("course_tees")
    .select("course_id")
    .eq("is_active", true)
    .or("slope_rating.is.null,course_rating.is.null,par_total.is.null,yards.is.null")
    .limit(teeScanLimit);
  if (teeErr) throw new Error(teeErr.message || "Failed to list incomplete tees.");
  const teeCourseIds = [...new Set((badTees ?? []).map((r: { course_id: string }) => r.course_id))];
  const teeIds = teeCourseIds.filter((id) => !seen.has(id));
  for (let i = 0; i < teeIds.length && out.length < maxRows; i += 120) {
    const slice = teeIds.slice(i, i + 120);
    if (slice.length === 0) break;
    const { data: crs, error: cErr } = await supabase
      .from("courses")
      .select("id, api_id, course_name, full_name")
      .in("id", slice)
      .not("api_id", "is", null);
    if (cErr) throw new Error(cErr.message || "Failed to load courses for incomplete tee sweep.");
    pushRows((crs ?? []) as Record<string, unknown>[]);
  }

  return out;
}
