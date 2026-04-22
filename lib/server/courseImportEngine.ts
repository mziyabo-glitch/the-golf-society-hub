import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { normalizeGolfCourseApiCourse } from "@/lib/courseNormalizer";
import type { GolfCourseApiCourse, NormalizedCourseImport } from "@/types/course";

export type ImportSourceType = "golfcourseapi" | "club_official" | "manual_seed";
export type ImportSyncStatus = "ok" | "partial" | "failed" | "skipped";

export type CourseSeed = {
  name: string;
  preferredApiId?: number;
  sourceUrl?: string;
  sourceType?: ImportSourceType;
};

export type ValidationIssue = {
  code: "HOLE_COUNT" | "SI_DUPLICATE" | "SI_OUT_OF_RANGE" | "NUMERIC_INVALID";
  message: string;
  teeName?: string;
  holeNumber?: number;
};

export type NightlyImportOptions = {
  dryRun?: boolean;
  overwriteManualOverrides?: boolean;
  includeSocietySeeds?: boolean;
  triggerType?: "manual" | "nightly";
};

export type NightlyImportCourseResult = {
  courseName: string;
  apiId: number | null;
  status: ImportSyncStatus;
  validationIssues: ValidationIssue[];
  error?: string;
  courseId?: string;
};

const GOLF_API_BASE = "https://api.golfcourseapi.com/v1";
const DEFAULT_PRIORITY_SEEDS: CourseSeed[] = [
  {
    name: "Upavon Golf Club",
    preferredApiId: 12241,
    sourceType: "club_official",
    sourceUrl: "https://upavongolfclub.co.uk",
  },
  {
    name: "Shrivenham Park Golf Club",
    sourceType: "club_official",
    sourceUrl: "https://www.shrivenhampark.co.uk",
  },
  {
    name: "Wycombe Heights Golf Centre",
    sourceType: "club_official",
    sourceUrl: "https://www.wycombeheightsgc.co.uk",
  },
];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[course-import-nightly] Missing required env: ${name}`);
  return value;
}

function asFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toConfidence(issues: ValidationIssue[]): number {
  const weighted = issues.reduce((sum, issue) => {
    if (issue.code === "HOLE_COUNT") return sum + 20;
    if (issue.code === "SI_DUPLICATE") return sum + 20;
    if (issue.code === "SI_OUT_OF_RANGE") return sum + 15;
    return sum + 10;
  }, 0);
  return Math.max(0, Math.min(100, 100 - weighted));
}

async function golfApiGet(path: string): Promise<unknown> {
  const key = process.env.GOLFCOURSE_API_KEY || process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY || process.env.NEXT_PUBLIC_GOLF_API_KEY;
  if (!key) throw new Error("Missing GOLFCOURSE_API_KEY");
  const res = await fetch(`${GOLF_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Key ${key}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GolfCourseAPI ${res.status}: ${body.slice(0, 240)}`);
  }
  return (await res.json()) as unknown;
}

function extractCourseRow(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const row = payload as Record<string, unknown>;
  const nested = (Array.isArray(row.courses) ? row.courses[0] : null) ?? row.course ?? row.data ?? payload;
  return typeof nested === "object" && nested !== null ? (nested as Record<string, unknown>) : {};
}

function coerceCourse(row: Record<string, unknown>): GolfCourseApiCourse {
  return {
    id: Number(row.id),
    name: typeof row.name === "string" ? row.name : undefined,
    course_name: typeof row.course_name === "string" ? row.course_name : undefined,
    club_name: typeof row.club_name === "string" ? row.club_name : undefined,
    club: typeof row.club === "string" ? row.club : undefined,
    lat: asFinite(row.lat ?? row.latitude) ?? undefined,
    lng: asFinite(row.lng ?? row.longitude) ?? undefined,
    latitude: asFinite(row.latitude ?? row.lat) ?? undefined,
    longitude: asFinite(row.longitude ?? row.lng) ?? undefined,
    address: row.address as string | Record<string, unknown> | undefined,
    city: typeof row.city === "string" ? row.city : undefined,
    country: typeof row.country === "string" ? row.country : undefined,
    location: row.location as string | Record<string, unknown> | undefined,
    tees: row.tees as GolfCourseApiCourse["tees"],
  };
}

async function searchCourseApiIdByName(query: string): Promise<number | null> {
  const payload = (await golfApiGet(`/search?search_query=${encodeURIComponent(query)}`)) as Record<string, unknown>;
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload.courses) ? payload.courses : Array.isArray(payload.data) ? payload.data : [];
  const hit = (rows as Record<string, unknown>[]).find((r) => Number.isFinite(Number(r.id)));
  return hit ? Number(hit.id) : null;
}

async function fetchCourseByApiId(apiId: number): Promise<{ raw: Record<string, unknown>; course: GolfCourseApiCourse }> {
  const payload = await golfApiGet(`/courses/${apiId}`);
  const row = extractCourseRow(payload);
  return { raw: row, course: coerceCourse(row) };
}

export function validateNormalizedImport(normalized: NormalizedCourseImport): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const teeBundle of normalized.tees) {
    const tee = teeBundle.tee;
    const holes = teeBundle.holes;
    if (holes.length !== 9 && holes.length !== 18) {
      issues.push({
        code: "HOLE_COUNT",
        teeName: tee.teeName,
        message: `Expected 9 or 18 holes, got ${holes.length}`,
      });
    }

    if (tee.courseRating != null && tee.courseRating <= 0) {
      issues.push({ code: "NUMERIC_INVALID", teeName: tee.teeName, message: "course_rating must be positive when present" });
    }
    if (tee.slopeRating != null && tee.slopeRating <= 0) {
      issues.push({ code: "NUMERIC_INVALID", teeName: tee.teeName, message: "slope_rating must be positive when present" });
    }
    if (tee.parTotal != null && tee.parTotal <= 0) {
      issues.push({ code: "NUMERIC_INVALID", teeName: tee.teeName, message: "par_total must be positive when present" });
    }

    const siSeen = new Set<number>();
    for (const hole of holes) {
      if (hole.par != null && hole.par <= 0) {
        issues.push({ code: "NUMERIC_INVALID", teeName: tee.teeName, holeNumber: hole.holeNumber, message: "par must be positive when present" });
      }
      if (hole.yardage != null && hole.yardage <= 0) {
        issues.push({
          code: "NUMERIC_INVALID",
          teeName: tee.teeName,
          holeNumber: hole.holeNumber,
          message: "yardage must be positive when present",
        });
      }
      if (hole.strokeIndex != null) {
        if (hole.strokeIndex < 1 || hole.strokeIndex > 18) {
          issues.push({
            code: "SI_OUT_OF_RANGE",
            teeName: tee.teeName,
            holeNumber: hole.holeNumber,
            message: `stroke_index ${hole.strokeIndex} is outside 1-18`,
          });
        }
        if (siSeen.has(hole.strokeIndex)) {
          issues.push({
            code: "SI_DUPLICATE",
            teeName: tee.teeName,
            holeNumber: hole.holeNumber,
            message: `stroke_index ${hole.strokeIndex} duplicated`,
          });
        } else {
          siSeen.add(hole.strokeIndex);
        }
      }
    }
  }
  return issues;
}

async function insertJobStart(
  supabase: SupabaseClient,
  payload: {
    batchId: string;
    triggerType: "manual" | "nightly";
    courseName: string;
    apiId: number | null;
    sourceType: ImportSourceType;
    sourceUrl: string | null;
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("course_import_jobs")
    .insert({
      batch_id: payload.batchId,
      trigger_type: payload.triggerType,
      target_course_name: payload.courseName,
      target_api_id: payload.apiId,
      source_type: payload.sourceType,
      source_url: payload.sourceUrl,
      sync_status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return null;
  return String((data as { id: string }).id);
}

async function updateJob(
  supabase: SupabaseClient,
  jobId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!jobId) return;
  await supabase.from("course_import_jobs").update(payload).eq("id", jobId);
}

async function upsertNormalizedImport(
  supabase: SupabaseClient,
  normalized: NormalizedCourseImport,
  metadata: {
    sourceType: ImportSourceType;
    sourceUrl: string | null;
    syncStatus: "ok" | "partial";
    confidence: number;
    importedAtIso: string;
    rawRow: Record<string, unknown>;
  },
): Promise<{ courseId: string }> {
  const coursePayload: Record<string, unknown> = {
    dedupe_key: normalized.course.dedupeKey,
    api_id: normalized.course.apiId,
    club_name: normalized.course.clubName,
    course_name: normalized.course.courseName,
    full_name: normalized.course.fullName,
    address: normalized.course.address,
    city: normalized.course.city,
    country: normalized.course.country,
    lat: normalized.course.latitude,
    lng: normalized.course.longitude,
    normalized_name: normalized.course.normalizedNameKey,
    source: normalized.course.source,
    source_type: metadata.sourceType,
    source_url: metadata.sourceUrl,
    sync_status: metadata.syncStatus,
    confidence_score: metadata.confidence,
    imported_at: metadata.importedAtIso,
    last_synced_at: metadata.importedAtIso,
    enrichment_status: metadata.syncStatus === "ok" ? "imported" : "partial",
    raw_row: metadata.rawRow,
  };

  const { data: savedCourse, error: courseError } = await supabase
    .from("courses")
    .upsert(coursePayload, { onConflict: "dedupe_key" })
    .select("id")
    .single();

  if (courseError || !savedCourse) {
    throw new Error(courseError?.message || "Failed to upsert course");
  }

  const courseId = String((savedCourse as { id: string }).id);
  const teeRows = normalized.tees.map((bundle) => ({
    course_id: courseId,
    tee_name: bundle.tee.teeName,
    course_rating: bundle.tee.courseRating,
    bogey_rating: bundle.tee.bogeyRating,
    slope_rating: bundle.tee.slopeRating,
    par_total: bundle.tee.parTotal,
    yards: bundle.tee.totalYards,
    total_meters: bundle.tee.totalMeters,
    gender: bundle.tee.gender,
    tee_color: bundle.tee.teeColor,
    is_default: bundle.tee.isDefault,
    display_order: bundle.tee.displayOrder,
    is_active: true,
    source_type: metadata.sourceType,
    source_url: metadata.sourceUrl,
    sync_status: metadata.syncStatus,
    confidence_score: metadata.confidence,
    imported_at: metadata.importedAtIso,
    last_synced_at: metadata.importedAtIso,
  }));

  const teeIdsByName = new Map<string, string>();
  for (const teeRow of teeRows) {
    const { data: savedTee, error: teeError } = await supabase
      .from("course_tees")
      .upsert(teeRow, { onConflict: "course_id,tee_name" })
      .select("id, tee_name")
      .single();
    if (teeError || !savedTee) throw new Error(teeError?.message || `Failed to upsert tee ${teeRow.tee_name}`);
    teeIdsByName.set(String((savedTee as { tee_name: string }).tee_name), String((savedTee as { id: string }).id));
  }

  await supabase.from("course_holes").delete().eq("course_id", courseId);

  for (const bundle of normalized.tees) {
    const teeId = teeIdsByName.get(bundle.tee.teeName);
    if (!teeId) continue;
    if (bundle.holes.length === 0) continue;
    const holeRows = bundle.holes.map((hole) => ({
      course_id: courseId,
      tee_id: teeId,
      hole_number: hole.holeNumber,
      par: hole.par,
      yardage: hole.yardage,
      stroke_index: hole.strokeIndex,
      source_type: metadata.sourceType,
      source_url: metadata.sourceUrl,
      sync_status: metadata.syncStatus,
      confidence_score: metadata.confidence,
      imported_at: metadata.importedAtIso,
      last_synced_at: metadata.importedAtIso,
    }));
    const { error } = await supabase.from("course_holes").upsert(holeRows, { onConflict: "tee_id,hole_number" });
    if (error) throw new Error(error.message || `Failed to upsert holes for tee ${bundle.tee.teeName}`);
  }

  return { courseId };
}

async function applyManualOverrides(
  supabase: SupabaseClient,
  courseId: string,
  overwriteManualOverrides: boolean,
): Promise<void> {
  if (overwriteManualOverrides) return;
  const { data: overrides, error } = await supabase
    .from("course_manual_overrides")
    .select("id, tee_id, hole_number, field_name, override_value")
    .eq("course_id", courseId)
    .eq("is_active", true)
    .eq("preserve_on_import", true);
  if (error || !overrides || overrides.length === 0) return;

  for (const row of overrides as Array<{
    tee_id: string | null;
    hole_number: number | null;
    field_name: string;
    override_value: unknown;
  }>) {
    const field = row.field_name;
    const raw = row.override_value;
    let value: unknown = raw;
    if (raw && typeof raw === "object" && !Array.isArray(raw) && "value" in (raw as Record<string, unknown>)) {
      value = (raw as Record<string, unknown>).value;
    }
    if (row.tee_id && row.hole_number != null) {
      await supabase
        .from("course_holes")
        .update({ [field]: value })
        .eq("course_id", courseId)
        .eq("tee_id", row.tee_id)
        .eq("hole_number", row.hole_number);
      continue;
    }
    if (row.tee_id && row.hole_number == null) {
      await supabase.from("course_tees").update({ [field]: value }).eq("id", row.tee_id).eq("course_id", courseId);
      continue;
    }
    if (!row.tee_id && row.hole_number == null) {
      await supabase.from("courses").update({ [field]: value }).eq("id", courseId);
    }
  }
}

async function discoverSocietyCourseSeeds(supabase: SupabaseClient): Promise<CourseSeed[]> {
  const seeds: CourseSeed[] = [];
  const { data: societies } = await supabase
    .from("societies")
    .select("id, name")
    .or("name.ilike.%M4%,name.ilike.%ZGS%")
    .limit(50);
  if (!societies || societies.length === 0) return seeds;
  const ids = societies.map((s: { id: string }) => s.id);
  const { data: events } = await supabase
    .from("events")
    .select("course_name, course_id")
    .in("society_id", ids)
    .not("course_name", "is", null)
    .limit(500);
  const seen = new Set<string>();
  for (const eventRow of (events ?? []) as Array<{ course_name: string | null }>) {
    const courseName = eventRow.course_name?.trim();
    if (!courseName) continue;
    const key = courseName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({ name: courseName, sourceType: "golfcourseapi" });
  }
  return seeds;
}

function mergeSeeds(priority: CourseSeed[], additional: CourseSeed[]): CourseSeed[] {
  const out: CourseSeed[] = [];
  const seen = new Set<string>();
  for (const seed of [...priority, ...additional]) {
    const key = seed.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(seed);
  }
  return out;
}

async function resolveApiId(supabase: SupabaseClient, seed: CourseSeed): Promise<number | null> {
  if (seed.preferredApiId && seed.preferredApiId > 0) return seed.preferredApiId;
  const { data: existing } = await supabase
    .from("courses")
    .select("api_id")
    .ilike("course_name", seed.name)
    .not("api_id", "is", null)
    .limit(1)
    .maybeSingle();
  const existingApi = existing ? Number((existing as { api_id?: number }).api_id) : null;
  if (existingApi != null && Number.isFinite(existingApi) && existingApi > 0) return existingApi;
  return searchCourseApiIdByName(seed.name);
}

export async function runNightlyCourseImport(
  options?: NightlyImportOptions,
): Promise<{ batchId: string; results: NightlyImportCourseResult[] }> {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);
  const dryRun = options?.dryRun === true;
  const includeSocietySeeds = options?.includeSocietySeeds !== false;
  const overwriteManualOverrides = options?.overwriteManualOverrides === true;
  const triggerType = options?.triggerType ?? "manual";
  const batchId = randomUUID();

  const societySeeds = includeSocietySeeds ? await discoverSocietyCourseSeeds(supabase) : [];
  const allSeeds = mergeSeeds(DEFAULT_PRIORITY_SEEDS, societySeeds);
  const results: NightlyImportCourseResult[] = [];

  for (const seed of allSeeds) {
    const sourceType = seed.sourceType ?? "golfcourseapi";
    const sourceUrl = seed.sourceUrl ?? null;
    const apiId = await resolveApiId(supabase, seed);
    const jobId = await insertJobStart(supabase, {
      batchId,
      triggerType,
      courseName: seed.name,
      apiId,
      sourceType,
      sourceUrl,
    });

    if (!apiId) {
      const failed: NightlyImportCourseResult = {
        courseName: seed.name,
        apiId: null,
        status: "failed",
        validationIssues: [],
        error: "Unable to resolve GolfCourseAPI id from seed",
      };
      results.push(failed);
      await updateJob(supabase, jobId, {
        sync_status: "failed",
        finished_at: new Date().toISOString(),
        error_message: failed.error,
      });
      continue;
    }

    try {
      const fetched = await fetchCourseByApiId(apiId);
      const normalized = normalizeGolfCourseApiCourse(fetched.course);
      const validationIssues = validateNormalizedImport(normalized);
      const status: "ok" | "partial" = validationIssues.length === 0 ? "ok" : "partial";
      const importedAtIso = new Date().toISOString();
      const confidence = toConfidence(validationIssues);

      let courseId: string | undefined;
      if (!dryRun) {
        const persisted = await upsertNormalizedImport(supabase, normalized, {
          sourceType,
          sourceUrl,
          syncStatus: status,
          confidence,
          importedAtIso,
          rawRow: fetched.raw,
        });
        courseId = persisted.courseId;
        await applyManualOverrides(supabase, persisted.courseId, overwriteManualOverrides);
      }

      const result: NightlyImportCourseResult = {
        courseName: seed.name,
        apiId,
        status,
        validationIssues,
        courseId,
      };
      results.push(result);

      await updateJob(supabase, jobId, {
        target_course_id: courseId ?? null,
        sync_status: status,
        finished_at: new Date().toISOString(),
        imported_at: dryRun ? null : importedAtIso,
        confidence_score: confidence,
        validation_errors: validationIssues,
        raw_source_payload: fetched.raw,
        summary: {
          dryRun,
          teeCount: normalized.tees.length,
          holeCount: normalized.tees.reduce((sum, tee) => sum + tee.holes.length, 0),
          overwriteManualOverrides,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed: NightlyImportCourseResult = {
        courseName: seed.name,
        apiId,
        status: "failed",
        validationIssues: [],
        error: message,
      };
      results.push(failed);
      await updateJob(supabase, jobId, {
        sync_status: "failed",
        finished_at: new Date().toISOString(),
        error_message: message,
      });
    }
  }

  return { batchId, results };
}

export { DEFAULT_PRIORITY_SEEDS };
