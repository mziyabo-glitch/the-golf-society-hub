import { supabase } from "@/lib/supabase";
import { importCourseFromApiId } from "@/services/courseImportService";
import type { MemberLike } from "@/lib/rbac";
import { hasRole } from "@/lib/rbac";

export type CourseOverrideFieldName =
  | "stroke_index"
  | "par"
  | "yardage"
  | "course_rating"
  | "slope_rating"
  | "par_total"
  | "total_yards"
  | "total_meters";

type OverrideScope = "tee" | "hole";

export type OverrideFieldDef = {
  field: CourseOverrideFieldName;
  scope: OverrideScope;
  dbColumn: string;
  integer: boolean;
};

const OVERRIDE_FIELDS: readonly OverrideFieldDef[] = [
  { field: "stroke_index", scope: "hole", dbColumn: "stroke_index", integer: true },
  { field: "par", scope: "hole", dbColumn: "par", integer: true },
  { field: "yardage", scope: "hole", dbColumn: "yardage", integer: true },
  { field: "course_rating", scope: "tee", dbColumn: "course_rating", integer: false },
  { field: "slope_rating", scope: "tee", dbColumn: "slope_rating", integer: true },
  { field: "par_total", scope: "tee", dbColumn: "par_total", integer: true },
  { field: "total_yards", scope: "tee", dbColumn: "yards", integer: true },
  { field: "total_meters", scope: "tee", dbColumn: "total_meters", integer: true },
] as const;

const FIELD_BY_NAME = new Map(OVERRIDE_FIELDS.map((def) => [def.field, def]));

export type CourseOverrideRow = {
  id: string;
  course_id: string;
  tee_id: string | null;
  hole_number: number | null;
  field_name: CourseOverrideFieldName;
  override_value: unknown;
  preserve_on_import: boolean;
  is_active: boolean;
  source_note: string | null;
  created_at: string;
  updated_at: string;
};

export type TeeIntegrityStats = {
  missingSiCount: number;
  duplicateSiValues: number[];
  invalidSiCount: number;
};

export type CourseReviewTee = {
  id: string;
  tee_name: string;
  source_type: string | null;
  source_url: string | null;
  sync_status: string | null;
  last_synced_at: string | null;
  imported_at: string | null;
  confidence_score: number | null;
  yards: number | null;
  total_meters: number | null;
  integrity: TeeIntegrityStats;
  manualOverrideCount: number;
};

export type CourseImportJobSummary = {
  id: string;
  sync_status: string | null;
  finished_at: string | null;
  error_message: string | null;
  summary: unknown;
};

export type CourseReviewSummary = {
  id: string;
  course_name: string;
  source_type: string | null;
  source_url: string | null;
  sync_status: string | null;
  last_synced_at: string | null;
  imported_at: string | null;
  confidence_score: number | null;
  api_id: number | null;
  manualOverrideCount: number;
  hasManualOverrides: boolean;
  tees: CourseReviewTee[];
  latestJob: CourseImportJobSummary | null;
};

export type TeeEditorHole = {
  id: string;
  tee_id: string;
  hole_number: number;
  par: number | null;
  yardage: number | null;
  stroke_index: number | null;
  source_type: string | null;
  source_url: string | null;
  sync_status: string | null;
  imported_at: string | null;
  last_synced_at: string | null;
};

export type TeeEditorBundle = {
  course: CourseReviewSummary;
  tee: CourseReviewTee;
  holes: TeeEditorHole[];
  activeOverrides: CourseOverrideRow[];
};

export type CourseImportBatchSummary = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  territory: string;
  seed_phase: string;
  trigger_type: string;
  total_candidates: number;
  total_attempted: number;
  total_inserted: number;
  total_updated: number;
  total_ok: number;
  total_partial: number;
  total_failed: number;
  total_skipped: number;
  summary_json: Record<string, unknown>;
};

export type CourseImportCandidateQueueItem = {
  id: string;
  candidate_name: string;
  territory: string;
  seed_phase: string;
  status: string;
  import_priority: number;
  canonical_api_id: number | null;
  sync_status: string;
  last_error: string | null;
  next_retry_at: string | null;
  refresh_due_at: string | null;
  last_synced_at: string | null;
  discovery_source: string;
};

export type TerritoryProgressSummary = {
  territory: string;
  seed_phase: string;
  total: number;
  seeded: number;
  refresh_due: number;
  failed: number;
};

export type SaveCourseOverrideInput = {
  courseId: string;
  teeId: string;
  holeNumber?: number | null;
  fieldName: CourseOverrideFieldName;
  rawValue: string | number;
  sourceNote?: string | null;
};

function n(v: unknown): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function asOverrides(rows: Record<string, unknown>[]): CourseOverrideRow[] {
  return rows.map((row) => ({
    id: String(row.id),
    course_id: String(row.course_id),
    tee_id: row.tee_id != null ? String(row.tee_id) : null,
    hole_number: row.hole_number != null ? Number(row.hole_number) : null,
    field_name: String(row.field_name) as CourseOverrideFieldName,
    override_value: row.override_value,
    preserve_on_import: row.preserve_on_import === true,
    is_active: row.is_active === true,
    source_note: row.source_note != null ? String(row.source_note) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

function overrideNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return n(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    if (typeof row.value === "number" && Number.isFinite(row.value)) return row.value;
    if (typeof row.value === "string") return n(row.value);
  }
  return null;
}

function integrityStats(holes: TeeEditorHole[]): TeeIntegrityStats {
  let missingSiCount = 0;
  let invalidSiCount = 0;
  const seen = new Set<number>();
  const dup = new Set<number>();
  for (const hole of holes) {
    if (hole.stroke_index == null) {
      missingSiCount += 1;
      continue;
    }
    const si = hole.stroke_index;
    if (si < 1 || si > 18) {
      invalidSiCount += 1;
      continue;
    }
    if (seen.has(si)) dup.add(si);
    else seen.add(si);
  }
  return { missingSiCount, invalidSiCount, duplicateSiValues: [...dup].sort((a, b) => a - b) };
}

function coerceOverrideValue(def: OverrideFieldDef, rawValue: string | number, holeNumber?: number | null): number {
  const parsed = n(rawValue);
  if (parsed == null) throw new Error("Override value must be numeric.");
  const value = def.integer ? Math.round(parsed) : Number(parsed.toFixed(2));

  if (def.field === "stroke_index") {
    if (holeNumber == null) throw new Error("Stroke index override requires a hole number.");
    if (value < 1 || value > 18) throw new Error("Stroke index must be between 1 and 18.");
  }
  if (def.field === "par" && value <= 0) throw new Error("Par must be greater than 0.");
  if (def.field === "yardage" && value <= 0) throw new Error("Yardage must be greater than 0.");
  if (def.field === "course_rating" && value <= 0) throw new Error("Course rating must be greater than 0.");
  if (def.field === "slope_rating" && value <= 0) throw new Error("Slope rating must be greater than 0.");
  if (def.field === "par_total" && value <= 0) throw new Error("Par total must be greater than 0.");
  if (def.field === "total_yards" && value <= 0) throw new Error("Total yards must be greater than 0.");
  if (def.field === "total_meters" && value <= 0) throw new Error("Total meters must be greater than 0.");
  return value;
}

async function listActiveOverridesForCourse(courseId: string): Promise<CourseOverrideRow[]> {
  const { data, error } = await supabase
    .from("course_manual_overrides")
    .select("*")
    .eq("course_id", courseId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  if (error) {
    if (error.code === "42P01" || error.code === "42501") return [];
    throw new Error(error.message || "Could not load course overrides.");
  }
  return asOverrides((data ?? []) as Record<string, unknown>[]);
}

async function applyOverride(override: CourseOverrideRow): Promise<void> {
  const def = FIELD_BY_NAME.get(override.field_name);
  if (!def) return;
  const value = overrideNumber(override.override_value);
  if (value == null) return;

  if (def.scope === "tee") {
    if (!override.tee_id) return;
    const { error } = await supabase
      .from("course_tees")
      .update({ [def.dbColumn]: value })
      .eq("id", override.tee_id)
      .eq("course_id", override.course_id);
    if (error) throw new Error(error.message || "Could not apply tee override.");
    return;
  }

  if (!override.tee_id || override.hole_number == null) return;
  const { error } = await supabase
    .from("course_holes")
    .update({ [def.dbColumn]: value })
    .eq("course_id", override.course_id)
    .eq("tee_id", override.tee_id)
    .eq("hole_number", override.hole_number);
  if (error) throw new Error(error.message || "Could not apply hole override.");
}

async function applyActiveOverridesForCourse(courseId: string): Promise<void> {
  const overrides = await listActiveOverridesForCourse(courseId);
  for (const override of overrides) await applyOverride(override);
}

async function latestImportJob(courseId: string, apiId: number | null): Promise<CourseImportJobSummary | null> {
  let q = supabase.from("course_import_jobs").select("id, sync_status, finished_at, error_message, summary").limit(1);
  q = courseId ? q.eq("target_course_id", courseId) : q.eq("target_api_id", apiId ?? -1);
  const { data, error } = await q.order("started_at", { ascending: false });
  if (error || !data || data.length === 0) return null;
  const row = data[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    sync_status: row.sync_status != null ? String(row.sync_status) : null,
    finished_at: row.finished_at != null ? String(row.finished_at) : null,
    error_message: row.error_message != null ? String(row.error_message) : null,
    summary: row.summary,
  };
}

export function canManageCourseDataUI(member: MemberLike | null | undefined): boolean {
  return hasRole(member, "CAPTAIN") || hasRole(member, "SECRETARY") || hasRole(member, "HANDICAPPER");
}

export function getEditableCourseOverrideFields(): readonly OverrideFieldDef[] {
  return OVERRIDE_FIELDS;
}

async function assembleCourseReviewSummary(
  row: Record<string, unknown>,
  options?: { includeInactiveTees?: boolean },
): Promise<CourseReviewSummary> {
  const courseId = String(row.id);
  const apiId = row.api_id != null ? Number(row.api_id) : null;
  const includeInactiveTees = options?.includeInactiveTees === true;
  let teesQuery = supabase
    .from("course_tees")
    .select("id, tee_name, source_type, source_url, sync_status, last_synced_at, imported_at, confidence_score, yards, total_meters")
    .eq("course_id", courseId)
    .order("display_order", { ascending: true })
    .order("tee_name", { ascending: true });
  if (!includeInactiveTees) {
    teesQuery = teesQuery.eq("is_active", true);
  }
  const [overrides, teesResp, holesResp, job] = await Promise.all([
    listActiveOverridesForCourse(courseId),
    teesQuery,
    supabase
      .from("course_holes")
      .select("id, tee_id, hole_number, par, yardage, stroke_index, source_type, source_url, sync_status, imported_at, last_synced_at")
      .eq("course_id", courseId),
    latestImportJob(courseId, apiId),
  ]);
  if (teesResp.error) throw new Error(teesResp.error.message || "Could not load tees.");
  if (holesResp.error) throw new Error(holesResp.error.message || "Could not load holes.");

  const holesByTee = new Map<string, TeeEditorHole[]>();
  for (const h of (holesResp.data ?? []) as Record<string, unknown>[]) {
    const teeIdKey = String(h.tee_id);
    const holeRow: TeeEditorHole = {
      id: String(h.id),
      tee_id: teeIdKey,
      hole_number: Number(h.hole_number),
      par: h.par != null ? Number(h.par) : null,
      yardage: h.yardage != null ? Number(h.yardage) : null,
      stroke_index: h.stroke_index != null ? Number(h.stroke_index) : null,
      source_type: h.source_type != null ? String(h.source_type) : null,
      source_url: h.source_url != null ? String(h.source_url) : null,
      sync_status: h.sync_status != null ? String(h.sync_status) : null,
      imported_at: h.imported_at != null ? String(h.imported_at) : null,
      last_synced_at: h.last_synced_at != null ? String(h.last_synced_at) : null,
    };
    const list = holesByTee.get(teeIdKey) ?? [];
    list.push(holeRow);
    holesByTee.set(teeIdKey, list);
  }

  const tees: CourseReviewTee[] = ((teesResp.data ?? []) as Record<string, unknown>[]).map((tee) => {
    const teeId = String(tee.id);
    const teeHoles = holesByTee.get(teeId) ?? [];
    return {
      id: teeId,
      tee_name: String(tee.tee_name ?? "Tee"),
      source_type: tee.source_type != null ? String(tee.source_type) : null,
      source_url: tee.source_url != null ? String(tee.source_url) : null,
      sync_status: tee.sync_status != null ? String(tee.sync_status) : null,
      last_synced_at: tee.last_synced_at != null ? String(tee.last_synced_at) : null,
      imported_at: tee.imported_at != null ? String(tee.imported_at) : null,
      confidence_score: tee.confidence_score != null ? Number(tee.confidence_score) : null,
      yards: tee.yards != null ? Number(tee.yards) : null,
      total_meters: tee.total_meters != null ? Number(tee.total_meters) : null,
      integrity: integrityStats(teeHoles),
      manualOverrideCount: overrides.filter((o) => o.tee_id === teeId).length,
    };
  });

  return {
    id: courseId,
    course_name: String(row.course_name ?? "Unknown course"),
    source_type: row.source_type != null ? String(row.source_type) : null,
    source_url: row.source_url != null ? String(row.source_url) : null,
    sync_status: row.sync_status != null ? String(row.sync_status) : null,
    last_synced_at: row.last_synced_at != null ? String(row.last_synced_at) : null,
    imported_at: row.imported_at != null ? String(row.imported_at) : null,
    confidence_score: row.confidence_score != null ? Number(row.confidence_score) : null,
    api_id: apiId,
    manualOverrideCount: overrides.length,
    hasManualOverrides: overrides.length > 0,
    tees,
    latestJob: job,
  };
}

/** Single course for deep links (tee editor); includes inactive tees so archived rows still open. */
export async function getCourseReviewSummaryById(courseId: string): Promise<CourseReviewSummary | null> {
  const { data: row, error } = await supabase
    .from("courses")
    .select("id, course_name, source_type, source_url, sync_status, last_synced_at, imported_at, confidence_score, api_id")
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not load course.");
  if (!row) return null;
  return assembleCourseReviewSummary(row as Record<string, unknown>, { includeInactiveTees: true });
}

export async function listCourseReviewSummaries(params?: { query?: string; limit?: number }): Promise<CourseReviewSummary[]> {
  const limit = Math.max(1, Math.min(120, params?.limit ?? 40));
  const query = (params?.query ?? "").trim();
  let q = supabase
    .from("courses")
    .select("id, course_name, source_type, source_url, sync_status, last_synced_at, imported_at, confidence_score, api_id")
    .order("course_name", { ascending: true })
    .limit(limit);
  if (query) q = q.ilike("course_name", `%${query}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message || "Could not load courses.");

  const out: CourseReviewSummary[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    out.push(await assembleCourseReviewSummary(row, { includeInactiveTees: false }));
  }
  return out;
}

export async function getTeeEditorBundle(courseId: string, teeId: string): Promise<TeeEditorBundle> {
  const course = await getCourseReviewSummaryById(courseId);
  if (!course) throw new Error("Course not found.");
  const tee = course.tees.find((t) => t.id === teeId);
  if (!tee) throw new Error("Tee not found.");

  const { data: holes, error } = await supabase
    .from("course_holes")
    .select("id, tee_id, hole_number, par, yardage, stroke_index, source_type, source_url, sync_status, imported_at, last_synced_at")
    .eq("course_id", courseId)
    .eq("tee_id", teeId)
    .order("hole_number", { ascending: true });
  if (error) throw new Error(error.message || "Could not load holes.");

  const holeRows: TeeEditorHole[] = ((holes ?? []) as Record<string, unknown>[]).map((h) => ({
    id: String(h.id),
    tee_id: String(h.tee_id),
    hole_number: Number(h.hole_number),
    par: h.par != null ? Number(h.par) : null,
    yardage: h.yardage != null ? Number(h.yardage) : null,
    stroke_index: h.stroke_index != null ? Number(h.stroke_index) : null,
    source_type: h.source_type != null ? String(h.source_type) : null,
    source_url: h.source_url != null ? String(h.source_url) : null,
    sync_status: h.sync_status != null ? String(h.sync_status) : null,
    imported_at: h.imported_at != null ? String(h.imported_at) : null,
    last_synced_at: h.last_synced_at != null ? String(h.last_synced_at) : null,
  }));

  const activeOverrides = await listActiveOverridesForCourse(courseId);
  return { course, tee, holes: holeRows, activeOverrides: activeOverrides.filter((o) => o.tee_id === teeId) };
}

export async function saveCourseManualOverride(input: SaveCourseOverrideInput): Promise<CourseOverrideRow> {
  const def = FIELD_BY_NAME.get(input.fieldName);
  if (!def) throw new Error("Field is not allowed.");
  if (def.scope === "hole" && input.holeNumber == null) throw new Error("Hole number is required for hole fields.");
  if (def.scope === "tee" && input.holeNumber != null) throw new Error("Hole number is not valid for tee fields.");

  const typedValue = coerceOverrideValue(def, input.rawValue, input.holeNumber);
  let query = supabase
    .from("course_manual_overrides")
    .select("*")
    .eq("course_id", input.courseId)
    .eq("field_name", input.fieldName)
    .eq("is_active", true);
  query = input.teeId ? query.eq("tee_id", input.teeId) : query.is("tee_id", null);
  query = input.holeNumber != null ? query.eq("hole_number", input.holeNumber) : query.is("hole_number", null);
  const { data: existingRows } = await query.limit(1);
  const existing = (existingRows?.[0] ?? null) as Record<string, unknown> | null;

  const payload = {
    course_id: input.courseId,
    tee_id: input.teeId,
    hole_number: input.holeNumber ?? null,
    field_name: input.fieldName,
    override_value: { value: typedValue, type: "number" },
    preserve_on_import: true,
    is_active: true,
    source_note: input.sourceNote ?? null,
  };

  const write = existing
    ? await supabase.from("course_manual_overrides").update(payload).eq("id", String(existing.id)).select("*").single()
    : await supabase.from("course_manual_overrides").insert(payload).select("*").single();
  if (write.error || !write.data) throw new Error(write.error?.message || "Could not save manual override.");

  const row = asOverrides([write.data as Record<string, unknown>])[0]!;
  await applyOverride(row);
  return row;
}

export async function disableCourseManualOverride(overrideId: string): Promise<void> {
  const { error } = await supabase
    .from("course_manual_overrides")
    .update({ is_active: false })
    .eq("id", overrideId);
  if (error) throw new Error(error.message || "Could not disable override.");
}

export async function clearCourseManualOverrideByScope(input: {
  courseId: string;
  teeId: string;
  holeNumber?: number | null;
  fieldName: CourseOverrideFieldName;
}): Promise<void> {
  let q = supabase
    .from("course_manual_overrides")
    .update({ is_active: false })
    .eq("course_id", input.courseId)
    .eq("tee_id", input.teeId)
    .eq("field_name", input.fieldName)
    .eq("is_active", true);
  q = input.holeNumber != null ? q.eq("hole_number", input.holeNumber) : q.is("hole_number", null);
  const { error } = await q;
  if (error) throw new Error(error.message || "Could not clear override.");
}

export async function triggerCourseReimportPreservingManual(courseId: string): Promise<void> {
  const { data: course, error } = await supabase.from("courses").select("id, api_id, course_name").eq("id", courseId).maybeSingle();
  if (error || !course) throw new Error(error?.message || "Course not found.");
  const apiId = course.api_id != null ? Number(course.api_id) : null;
  if (!apiId || !Number.isFinite(apiId)) {
    throw new Error("This course has no GolfCourseAPI id and cannot be re-imported automatically.");
  }

  const { data: jobData } = await supabase
    .from("course_import_jobs")
    .insert({
      trigger_type: "manual",
      target_course_name: course.course_name,
      target_api_id: apiId,
      target_course_id: courseId,
      source_type: "golfcourseapi",
      sync_status: "running",
      started_at: new Date().toISOString(),
      summary: { trigger: "admin_reimport" },
    })
    .select("id")
    .maybeSingle();
  const jobId = jobData?.id ? String(jobData.id) : null;

  try {
    const imported = await importCourseFromApiId(apiId);
    await applyActiveOverridesForCourse(imported.courseId);
    if (jobId) {
      await supabase
        .from("course_import_jobs")
        .update({
          sync_status: "ok",
          finished_at: new Date().toISOString(),
          imported_at: new Date().toISOString(),
          target_course_id: imported.courseId,
          summary: {
            trigger: "admin_reimport",
            teeCount: imported.teeCount,
            holeCount: imported.holeCount,
            overridesPreserved: true,
          },
        })
        .eq("id", jobId);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (jobId) {
      await supabase
        .from("course_import_jobs")
        .update({
          sync_status: "failed",
          finished_at: new Date().toISOString(),
          error_message: message,
          summary: { trigger: "admin_reimport", overridesPreserved: true },
        })
        .eq("id", jobId);
    }
    throw e;
  }
}

export async function getLatestCourseImportBatch(): Promise<CourseImportBatchSummary | null> {
  const { data, error } = await supabase
    .from("course_import_batches")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    started_at: String(row.started_at),
    finished_at: row.finished_at != null ? String(row.finished_at) : null,
    status: String(row.status ?? "unknown"),
    territory: String(row.territory ?? "uk"),
    seed_phase: String(row.seed_phase ?? "england_wales"),
    trigger_type: String(row.trigger_type ?? "nightly"),
    total_candidates: Number(row.total_candidates ?? 0),
    total_attempted: Number(row.total_attempted ?? 0),
    total_inserted: Number(row.total_inserted ?? 0),
    total_updated: Number(row.total_updated ?? 0),
    total_ok: Number(row.total_ok ?? 0),
    total_partial: Number(row.total_partial ?? 0),
    total_failed: Number(row.total_failed ?? 0),
    total_skipped: Number(row.total_skipped ?? 0),
    summary_json: (row.summary_json as Record<string, unknown>) ?? {},
  };
}

export async function listImportCandidatesByStatus(
  statuses: string[],
  limit = 50,
): Promise<CourseImportCandidateQueueItem[]> {
  const capped = Math.max(1, Math.min(200, limit));
  let q = supabase
    .from("course_import_candidates")
    .select(
      "id, candidate_name, territory, seed_phase, status, import_priority, canonical_api_id, sync_status, last_error, next_retry_at, refresh_due_at, last_synced_at, discovery_source",
    )
    .order("import_priority", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(capped);
  if (statuses.length > 0) q = q.in("status", statuses);
  const { data, error } = await q;
  if (error) throw new Error(error.message || "Could not load candidate queue.");
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    candidate_name: String(row.candidate_name ?? ""),
    territory: String(row.territory ?? "uk"),
    seed_phase: String(row.seed_phase ?? "england_wales"),
    status: String(row.status ?? "queued"),
    import_priority: Number(row.import_priority ?? 0),
    canonical_api_id: row.canonical_api_id != null ? Number(row.canonical_api_id) : null,
    sync_status: String(row.sync_status ?? "queued"),
    last_error: row.last_error != null ? String(row.last_error) : null,
    next_retry_at: row.next_retry_at != null ? String(row.next_retry_at) : null,
    refresh_due_at: row.refresh_due_at != null ? String(row.refresh_due_at) : null,
    last_synced_at: row.last_synced_at != null ? String(row.last_synced_at) : null,
    discovery_source: String(row.discovery_source ?? "unknown"),
  }));
}

export async function getTerritoryProgressSummary(): Promise<TerritoryProgressSummary[]> {
  const { data, error } = await supabase
    .from("course_import_candidates")
    .select("territory, seed_phase, status");
  if (error) throw new Error(error.message || "Could not load territory progress.");
  const grouped = new Map<string, TerritoryProgressSummary>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const territory = String(row.territory ?? "uk");
    const seedPhase = String(row.seed_phase ?? "england_wales");
    const key = `${territory}::${seedPhase}`;
    const current = grouped.get(key) ?? {
      territory,
      seed_phase: seedPhase,
      total: 0,
      seeded: 0,
      refresh_due: 0,
      failed: 0,
    };
    current.total += 1;
    const status = String(row.status ?? "queued");
    if (status === "imported") current.seeded += 1;
    if (status === "failed") current.failed += 1;
    if (status === "resolved") current.refresh_due += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => a.seed_phase.localeCompare(b.seed_phase));
}
