import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { normalizeGolfCourseApiCourse } from "@/lib/courseNormalizer";
import type { GolfCourseApiCourse, NormalizedCourseImport } from "@/types/course";
import { loadTerritoryDiscoveryDataset } from "@/lib/server/courseImportDiscoveryAdapter";
import {
  evaluateCourseCatalogFreshness,
  fetchStaleCatalogCoursesForSweep,
  getCourseCatalogFreshnessThresholdsFromEnv,
  type CourseCatalogFreshnessReport,
  type CourseCatalogFreshnessThresholds,
  type StaleCatalogCourseRow,
} from "@/lib/server/courseCatalogFreshness";

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
  triggerType?: "manual" | "nightly" | "territory_nightly";
};

export type NightlyImportCourseResult = {
  courseName: string;
  apiId: number | null;
  status: ImportSyncStatus;
  validationIssues: ValidationIssue[];
  error?: string;
  courseId?: string;
};

export type TerritorySeedPhase = "england_wales" | "scotland" | "ireland";

export type TerritoryImportMode = "nightly" | "manual";

export type TerritoryImportCaps = {
  maxPriorityCourses: number;
  maxNewSeeds: number;
  maxRetries: number;
  /** Sub-cap for how many imported refresh-due rows to fetch into the refresh bucket (refresh phase only). */
  maxRefreshes: number;
  maxDiscoveryPerRun: number;
  /**
   * Max GolfCourseAPI imports in the growth phase (high-priority + retries + queued new seeds only).
   * Does not include imported refresh or catalog stale sweep.
   */
  maxNewCourseImportAttempts: number;
  /** Max imports for candidates already imported but due for refresh. Separate API budget from growth. */
  maxStaleCandidateRefreshAttempts: number;
  /** Max rows processed in the optional catalog stale sweep (separate from candidate budgets). */
  maxStaleCatalogSweepCourses: number;
  /**
   * @deprecated Legacy single ceiling; when set via env/CLI partial caps, seeds maxNewCourseImportAttempts if the new field is omitted.
   */
  maxTotalAttempts?: number;
};

export type TerritoryNightlyImportOptions = {
  dryRun?: boolean;
  overwriteManualOverrides?: boolean;
  includeSocietySeeds?: boolean;
  triggerType?: TerritoryImportMode;
  phaseOverride?: TerritorySeedPhase;
  territoryOverride?: string;
  caps?: Partial<TerritoryImportCaps>;
  /** Overrides env-based defaults from `getCourseCatalogFreshnessThresholdsFromEnv`. */
  catalogFreshnessThresholds?: Partial<CourseCatalogFreshnessThresholds>;
  /** When true, always run the post-batch stale-catalog sweep (for tests / ops). */
  forceCatalogFullRefresh?: boolean;
};

export type TerritoryCandidateStatus = "queued" | "resolved" | "imported" | "rejected" | "failed" | "skipped";

export type StaleCatalogSweepSummary = {
  attempted: number;
  skippedDuplicateApiInBatch: number;
  ok: number;
  partial: number;
  failed: number;
  results: NightlyImportCourseResult[];
};

export type CandidateImportPhaseSummary = {
  attempted: number;
  inserted: number;
  updated: number;
  ok: number;
  partial: number;
  failed: number;
};

export type TerritoryImportOutcome = {
  batchId: string;
  batchRunId: string;
  phase: TerritorySeedPhase;
  territory: string;
  results: NightlyImportCourseResult[];
  discoveredCandidates: number;
  attemptedCandidates: number;
  insertedCourses: number;
  updatedCourses: number;
  missingSiCount: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
  manualReviewItems: Array<{ courseName: string; status: ImportSyncStatus; reason: string }>;
  report: Record<string, unknown>;
  catalogFreshness: CourseCatalogFreshnessReport;
  staleCatalogSweep?: StaleCatalogSweepSummary;
  newCourseGrowthSummary: CandidateImportPhaseSummary;
  staleCandidateRefreshSummary: CandidateImportPhaseSummary;
  /** When non-null, catalog stale sweep did not run (or not fully) for this reason. */
  skippedStaleCatalogSweepReason: string | null;
  /** Queued candidates remaining after growth + refresh phases (same phase/territory). */
  queuedCandidatesAfterCandidatePhases: number;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const maxRetriesRaw = Number(process.env.COURSE_IMPORT_HTTP_MAX_RETRIES ?? "4");
  const maxRetries = Number.isFinite(maxRetriesRaw) && maxRetriesRaw >= 0 ? Math.round(maxRetriesRaw) : 4;
  const baseDelayRaw = Number(process.env.COURSE_IMPORT_HTTP_BASE_DELAY_MS ?? "1200");
  const baseDelayMs = Number.isFinite(baseDelayRaw) && baseDelayRaw > 0 ? Math.round(baseDelayRaw) : 1200;

  let attempt = 0;
  for (;;) {
    const res = await fetch(`${GOLF_API_BASE}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Key ${key}`,
      },
    });
    if (res.ok) {
      return (await res.json()) as unknown;
    }

    const body = await res.text().catch(() => "");
    const retriable = res.status === 429 || (res.status >= 500 && res.status <= 599);
    if (!retriable || attempt >= maxRetries) {
      throw new Error(`GolfCourseAPI ${res.status}: ${body.slice(0, 240)}`);
    }

    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader != null ? Number(retryAfterHeader) : NaN;
    const retryAfterMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.round(retryAfterSeconds * 1000)
        : baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 300);
    await sleep(retryAfterMs + jitter);
    attempt += 1;
  }
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
    triggerType: "manual" | "nightly" | "territory_nightly";
    courseName: string;
    apiId: number | null;
    sourceType: ImportSourceType;
    sourceUrl: string | null;
    batchRunId?: string | null;
    candidateId?: string | null;
    seedPhase?: TerritorySeedPhase | null;
    territory?: string | null;
    mode?: "legacy_nightly" | "territory_nightly" | "manual";
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
      batch_run_id: payload.batchRunId ?? null,
      candidate_id: payload.candidateId ?? null,
      seed_phase: payload.seedPhase ?? null,
      territory: payload.territory ?? null,
      mode: payload.mode ?? (payload.triggerType === "territory_nightly" ? "territory_nightly" : "legacy_nightly"),
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
    territory?: string | null;
    seedPhase?: TerritorySeedPhase | null;
    discoverySource?: string | null;
    importPriority?: number | null;
    refreshDueAt?: string | null;
    firstDiscoveredAt?: string | null;
    lastDiscoveredAt?: string | null;
    canonicalApiId?: number | null;
    seededStatus?: "unseeded" | "seeded" | "refresh_due" | "retired";
    discoveryStatus?: "unknown" | "discovered" | "queued" | "resolved" | "rejected";
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
    territory: metadata.territory ?? null,
    seed_phase: metadata.seedPhase ?? null,
    discovery_source: metadata.discoverySource ?? null,
    import_priority: metadata.importPriority ?? 0,
    refresh_due_at: metadata.refreshDueAt ?? null,
    first_discovered_at: metadata.firstDiscoveredAt ?? null,
    last_discovered_at: metadata.lastDiscoveredAt ?? null,
    canonical_api_id: metadata.canonicalApiId ?? normalized.course.apiId,
    seeded_status: metadata.seededStatus ?? "seeded",
    discovery_status: metadata.discoveryStatus ?? "resolved",
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

type TerritoryCandidateRow = {
  id: string;
  candidate_name: string;
  normalized_name: string;
  country: string | null;
  territory: string;
  seed_phase: TerritorySeedPhase;
  discovery_source: string;
  status: TerritoryCandidateStatus;
  canonical_api_id: number | null;
  import_priority: number;
  refresh_due_at: string | null;
  last_synced_at: string | null;
  sync_status: string;
  confidence_score: number | null;
  retry_count: number;
  next_retry_at: string | null;
  first_discovered_at: string | null;
  last_discovered_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
};

const PHASE_ORDER: TerritorySeedPhase[] = ["england_wales", "scotland", "ireland"];
const DEFAULT_TERRITORY = "uk";

function normalizeCandidateName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isPostgresUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  if (e.code === "23505") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("duplicate key") || m.includes("unique constraint");
}

type CandidateMergeRow = {
  id: string;
  candidate_name: string;
  normalized_name: string;
  import_priority: number;
  metadata: Record<string, unknown>;
};

async function selectCandidateByCanonicalApi(
  supabase: SupabaseClient,
  territory: string,
  canonicalApiId: number,
): Promise<CandidateMergeRow | null> {
  const { data, error } = await supabase
    .from("course_import_candidates")
    .select("id, candidate_name, normalized_name, import_priority, metadata")
    .eq("territory", territory)
    .eq("canonical_api_id", canonicalApiId)
    .limit(1);
  if (error) throw new Error(error.message || "Failed to read candidate by canonical API id.");
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    candidate_name: String(row.candidate_name ?? ""),
    normalized_name: String(row.normalized_name ?? ""),
    import_priority: Number(row.import_priority ?? 0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

async function selectCandidateByNormalizedName(
  supabase: SupabaseClient,
  territory: string,
  normalizedName: string,
): Promise<(CandidateMergeRow & { canonical_api_id: number | null }) | null> {
  const { data, error } = await supabase
    .from("course_import_candidates")
    .select("id, candidate_name, normalized_name, import_priority, metadata, canonical_api_id")
    .eq("territory", territory)
    .eq("normalized_name", normalizedName)
    .limit(1);
  if (error) throw new Error(error.message || "Failed to read candidate by normalized name.");
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const api = row.canonical_api_id;
  return {
    id: String(row.id),
    candidate_name: String(row.candidate_name ?? ""),
    normalized_name: String(row.normalized_name ?? ""),
    import_priority: Number(row.import_priority ?? 0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    canonical_api_id: api != null && Number.isFinite(Number(api)) ? Number(api) : null,
  };
}

async function mergeDiscoveryIntoCandidate(
  supabase: SupabaseClient,
  existing: CandidateMergeRow,
  params: {
    name: string;
    country: string | null;
    phase: TerritorySeedPhase;
    discoverySource: string;
    priority: number;
    status?: TerritoryCandidateStatus;
    metadata?: Record<string, unknown>;
  },
  options: { nowIso: string; canonicalApiId?: number | null },
): Promise<void> {
  const existingMeta = existing.metadata ?? {};
  const existingAliases = Array.isArray(existingMeta.aliases)
    ? existingMeta.aliases.map((v) => String(v))
    : [];
  const aliasSet = new Set<string>([existing.candidate_name.trim(), ...existingAliases]);
  aliasSet.add(params.name.trim());
  const mergedMetadata: Record<string, unknown> = {
    ...existingMeta,
    ...(params.metadata ?? {}),
    aliases: [...aliasSet].filter((v) => v.length > 0),
  };
  const nextPriority = Math.max(existing.import_priority, params.priority);
  const patch: Record<string, unknown> = {
    candidate_name: existing.candidate_name.trim() || params.name,
    normalized_name: existing.normalized_name,
    country: params.country,
    seed_phase: params.phase,
    discovery_source: params.discoverySource,
    status: params.status ?? "queued",
    import_priority: nextPriority,
    last_discovered_at: options.nowIso,
    metadata: mergedMetadata,
  };
  if (options.canonicalApiId != null && options.canonicalApiId > 0) {
    patch.canonical_api_id = options.canonicalApiId;
  }
  const { error: updateErr } = await supabase.from("course_import_candidates").update(patch).eq("id", existing.id);
  if (updateErr) throw new Error(updateErr.message || "Failed to merge discovery into candidate.");
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function getTerritoryImportCaps(overrides?: Partial<TerritoryImportCaps>): TerritoryImportCaps {
  const legacyTotal = overrides?.maxTotalAttempts;
  const maxNewCourseImportAttempts =
    overrides?.maxNewCourseImportAttempts ??
    (legacyTotal != null ? legacyTotal : parsePositiveIntEnv("COURSE_IMPORT_MAX_NEW_COURSE_IMPORT_ATTEMPTS", 42));
  const maxStaleCandidateRefreshAttempts =
    overrides?.maxStaleCandidateRefreshAttempts ??
    parsePositiveIntEnv("COURSE_IMPORT_MAX_STALE_CANDIDATE_REFRESH", 8);
  const maxStaleCatalogSweepCourses =
    overrides?.maxStaleCatalogSweepCourses ?? parsePositiveIntEnv("COURSE_IMPORT_STALE_SWEEP_MAX_COURSES", 12);
  return {
    maxPriorityCourses: overrides?.maxPriorityCourses ?? parsePositiveIntEnv("COURSE_IMPORT_MAX_PRIORITY", 12),
    maxNewSeeds: overrides?.maxNewSeeds ?? parsePositiveIntEnv("COURSE_IMPORT_MAX_NEW_SEEDS", 20),
    maxRetries: overrides?.maxRetries ?? parsePositiveIntEnv("COURSE_IMPORT_MAX_RETRIES", 12),
    maxRefreshes: overrides?.maxRefreshes ?? parsePositiveIntEnv("COURSE_IMPORT_MAX_REFRESHES", 25),
    maxDiscoveryPerRun: overrides?.maxDiscoveryPerRun ?? parsePositiveIntEnv("COURSE_IMPORT_MAX_DISCOVERY", 120),
    maxNewCourseImportAttempts,
    maxStaleCandidateRefreshAttempts,
    maxStaleCatalogSweepCourses,
    ...(legacyTotal != null ? { maxTotalAttempts: legacyTotal } : {}),
  };
}

type CandidatePickLimits = {
  maxTotalAttempts: number;
  maxPriorityCourses: number;
  maxNewSeeds: number;
  maxRetries: number;
  maxRefreshes: number;
};

async function countQueuedCandidatesForPhase(
  supabase: SupabaseClient,
  phase: TerritorySeedPhase,
  territory: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("course_import_candidates")
    .select("id", { count: "exact", head: true })
    .eq("seed_phase", phase)
    .eq("territory", territory)
    .eq("status", "queued");
  if (error) throw new Error(error.message || "Failed to count queued candidates.");
  return count ?? 0;
}

function computeRefreshDueIso(now: Date): string {
  const days = parsePositiveIntEnv("COURSE_IMPORT_REFRESH_DAYS", 30);
  const due = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return due.toISOString();
}

function computeRetryDueIso(now: Date, retryCount: number): string {
  const hours = parsePositiveIntEnv("COURSE_IMPORT_RETRY_BASE_HOURS", 6);
  const factor = Math.max(1, retryCount);
  const due = new Date(now.getTime() + hours * factor * 60 * 60 * 1000);
  return due.toISOString();
}

async function resolveActivePhase(
  supabase: SupabaseClient,
  phaseOverride?: TerritorySeedPhase,
): Promise<TerritorySeedPhase> {
  if (phaseOverride) return phaseOverride;
  const envPhase = process.env.COURSE_IMPORT_ACTIVE_PHASE;
  if (envPhase === "england_wales" || envPhase === "scotland" || envPhase === "ireland") return envPhase;

  for (const phase of PHASE_ORDER) {
    const { count, error } = await supabase
      .from("course_import_candidates")
      .select("id", { count: "exact", head: true })
      .eq("seed_phase", phase)
      .in("status", ["queued", "failed"]);
    if (!error && (count ?? 0) > 0) return phase;
  }
  return "england_wales";
}

function asCandidateRow(row: Record<string, unknown>): TerritoryCandidateRow {
  return {
    id: String(row.id),
    candidate_name: String(row.candidate_name ?? ""),
    normalized_name: String(row.normalized_name ?? ""),
    country: row.country != null ? String(row.country) : null,
    territory: String(row.territory ?? DEFAULT_TERRITORY),
    seed_phase: (row.seed_phase as TerritorySeedPhase) ?? "england_wales",
    discovery_source: String(row.discovery_source ?? "unknown"),
    status: (row.status as TerritoryCandidateStatus) ?? "queued",
    canonical_api_id: row.canonical_api_id != null ? Number(row.canonical_api_id) : null,
    import_priority: Number.isFinite(Number(row.import_priority)) ? Number(row.import_priority) : 0,
    refresh_due_at: row.refresh_due_at != null ? String(row.refresh_due_at) : null,
    last_synced_at: row.last_synced_at != null ? String(row.last_synced_at) : null,
    sync_status: String(row.sync_status ?? "queued"),
    confidence_score: row.confidence_score != null ? Number(row.confidence_score) : null,
    retry_count: Number.isFinite(Number(row.retry_count)) ? Number(row.retry_count) : 0,
    next_retry_at: row.next_retry_at != null ? String(row.next_retry_at) : null,
    first_discovered_at: row.first_discovered_at != null ? String(row.first_discovered_at) : null,
    last_discovered_at: row.last_discovered_at != null ? String(row.last_discovered_at) : null,
    last_error: row.last_error != null ? String(row.last_error) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

async function upsertCandidate(
  supabase: SupabaseClient,
  params: {
    name: string;
    country: string | null;
    territory: string;
    phase: TerritorySeedPhase;
    discoverySource: string;
    priority: number;
    canonicalApiId?: number | null;
    status?: TerritoryCandidateStatus;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const normalizedName = normalizeCandidateName(params.name);
  const pinnedApiId =
    params.canonicalApiId != null && Number.isFinite(Number(params.canonicalApiId)) && Number(params.canonicalApiId) > 0
      ? Math.round(Number(params.canonicalApiId))
      : null;

  if (pinnedApiId != null) {
    const byApi = await selectCandidateByCanonicalApi(supabase, params.territory, pinnedApiId);
    if (byApi) {
      await mergeDiscoveryIntoCandidate(supabase, byApi, params, { nowIso, canonicalApiId: pinnedApiId });
      return;
    }
  }

  if (pinnedApiId == null) {
    const byName = await selectCandidateByNormalizedName(supabase, params.territory, normalizedName);
    if (byName) {
      const { error: upErr } = await supabase
        .from("course_import_candidates")
        .update({
          country: params.country,
          seed_phase: params.phase,
          discovery_source: params.discoverySource,
          status: params.status ?? "queued",
          import_priority: Math.max(byName.import_priority, params.priority),
          last_discovered_at: nowIso,
          metadata: { ...byName.metadata, ...(params.metadata ?? {}) },
        })
        .eq("id", byName.id);
      if (upErr) throw new Error(upErr.message || "Failed to update candidate by normalized name.");
      return;
    }
  }

  const payload = {
    candidate_name: params.name,
    normalized_name: normalizedName,
    country: params.country,
    territory: params.territory,
    seed_phase: params.phase,
    discovery_source: params.discoverySource,
    import_priority: params.priority,
    canonical_api_id: pinnedApiId ?? null,
    status: params.status ?? "queued",
    sync_status: "queued" as const,
    first_discovered_at: nowIso,
    last_discovered_at: nowIso,
    metadata: params.metadata ?? {},
  };

  const { error } = await supabase
    .from("course_import_candidates")
    .upsert(payload, { onConflict: "territory,normalized_name" });
  if (!error) return;

  if (isPostgresUniqueViolation(error) && pinnedApiId != null) {
    const recovered = await selectCandidateByCanonicalApi(supabase, params.territory, pinnedApiId);
    if (recovered) {
      await mergeDiscoveryIntoCandidate(supabase, recovered, params, { nowIso, canonicalApiId: pinnedApiId });
      return;
    }
    const fallback = { ...payload, canonical_api_id: null };
    const { error: retryErr } = await supabase
      .from("course_import_candidates")
      .upsert(fallback, { onConflict: "territory,normalized_name" });
    if (!retryErr) return;
    throw new Error(retryErr.message || "Failed to upsert candidate after duplicate canonical fallback.");
  }
  throw new Error((error as { message?: string }).message || "Failed to upsert candidate");
}

async function discoverCandidatesBounded(
  supabase: SupabaseClient,
  phase: TerritorySeedPhase,
  territory: string,
  caps: TerritoryImportCaps,
  includeSocietySeeds: boolean,
): Promise<number> {
  let discovered = 0;
  const dataset = await loadTerritoryDiscoveryDataset(phase);
  for (const item of dataset.slice(0, caps.maxDiscoveryPerRun)) {
    await upsertCandidate(supabase, {
      name: item.name,
      country: item.country,
      territory,
      phase,
      discoverySource: item.source,
      priority: item.priority,
      status: "queued",
    });
    discovered += 1;
  }

  for (const pinned of DEFAULT_PRIORITY_SEEDS) {
    await upsertCandidate(supabase, {
      name: pinned.name,
      country: null,
      territory,
      phase,
      discoverySource: "pinned_seed",
      priority: 900,
      canonicalApiId: pinned.preferredApiId ?? null,
      metadata: {
        sourceType: pinned.sourceType ?? "manual_seed",
        sourceUrl: pinned.sourceUrl ?? null,
      },
    });
    discovered += 1;
  }

  if (includeSocietySeeds) {
    const societySeeds = await discoverSocietyCourseSeeds(supabase);
    for (const seed of societySeeds.slice(0, caps.maxDiscoveryPerRun)) {
      await upsertCandidate(supabase, {
        name: seed.name,
        country: null,
        territory,
        phase,
        discoverySource: "society_seed",
        priority: 850,
        canonicalApiId: seed.preferredApiId ?? null,
        metadata: {
          sourceType: seed.sourceType ?? "golfcourseapi",
          sourceUrl: seed.sourceUrl ?? null,
        },
      });
      discovered += 1;
    }
  }
  return discovered;
}

async function listCandidateBucket(
  supabase: SupabaseClient,
  params: {
    phase: TerritorySeedPhase;
    territory: string;
    statuses?: TerritoryCandidateStatus[];
    minPriority?: number;
    retryDueOnly?: boolean;
    refreshDueOnly?: boolean;
    limit: number;
  },
): Promise<TerritoryCandidateRow[]> {
  let q = supabase
    .from("course_import_candidates")
    .select("*")
    .eq("seed_phase", params.phase)
    .eq("territory", params.territory)
    .order("import_priority", { ascending: false })
    .order("last_discovered_at", { ascending: false })
    .limit(Math.max(1, params.limit));

  if (params.statuses && params.statuses.length > 0) q = q.in("status", params.statuses);
  if (params.minPriority != null) q = q.gte("import_priority", params.minPriority);
  if (params.retryDueOnly) q = q.lte("next_retry_at", new Date().toISOString());
  if (params.refreshDueOnly) q = q.lte("refresh_due_at", new Date().toISOString());

  const { data, error } = await q;
  if (error) throw new Error(error.message || "Failed to list candidate bucket");
  return ((data ?? []) as Record<string, unknown>[]).map(asCandidateRow);
}

function pickCandidates(
  limits: CandidatePickLimits,
  priorityCandidates: TerritoryCandidateRow[],
  retryCandidates: TerritoryCandidateRow[],
  newCandidates: TerritoryCandidateRow[],
  refreshCandidates: TerritoryCandidateRow[],
): TerritoryCandidateRow[] {
  if (limits.maxTotalAttempts <= 0) return [];
  const seen = new Set<string>();
  const picked: TerritoryCandidateRow[] = [];
  const addMany = (rows: TerritoryCandidateRow[], cap: number): void => {
    for (const row of rows) {
      if (picked.length >= limits.maxTotalAttempts) return;
      if (cap <= 0) return;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      picked.push(row);
      cap -= 1;
      if (cap <= 0) return;
    }
  };
  addMany(priorityCandidates, limits.maxPriorityCourses);
  addMany(retryCandidates, limits.maxRetries);
  addMany(newCandidates, limits.maxNewSeeds);
  addMany(refreshCandidates, limits.maxRefreshes);
  return picked.slice(0, limits.maxTotalAttempts);
}

export function planTerritoryCandidateOrder(
  caps: TerritoryImportCaps,
  buckets: {
    priority: Array<{ id: string }>;
    retries: Array<{ id: string }>;
    fresh: Array<{ id: string }>;
    refresh: Array<{ id: string }>;
  },
): string[] {
  const asRow = (items: Array<{ id: string }>): TerritoryCandidateRow[] =>
    items.map((item) => ({
      id: item.id,
      candidate_name: item.id,
      normalized_name: item.id,
      country: null,
      territory: DEFAULT_TERRITORY,
      seed_phase: "england_wales",
      discovery_source: "test",
      status: "queued",
      canonical_api_id: null,
      import_priority: 0,
      refresh_due_at: null,
      last_synced_at: null,
      sync_status: "queued",
      confidence_score: null,
      retry_count: 0,
      next_retry_at: null,
      first_discovered_at: null,
      last_discovered_at: null,
      last_error: null,
      metadata: {},
    }));
  const combinedCeiling = caps.maxNewCourseImportAttempts + caps.maxStaleCandidateRefreshAttempts;
  const limits: CandidatePickLimits = {
    maxTotalAttempts: combinedCeiling,
    maxPriorityCourses: caps.maxPriorityCourses,
    maxNewSeeds: caps.maxNewSeeds,
    maxRetries: caps.maxRetries,
    maxRefreshes: caps.maxStaleCandidateRefreshAttempts,
  };
  return pickCandidates(limits, asRow(buckets.priority), asRow(buckets.retries), asRow(buckets.fresh), asRow(buckets.refresh)).map(
    (row) => row.id,
  );
}

async function insertBatchRun(
  supabase: SupabaseClient,
  payload: {
    phase: TerritorySeedPhase;
    territory: string;
    mode: TerritoryImportMode;
    caps: TerritoryImportCaps;
    triggerType: "manual" | "nightly" | "territory_nightly";
    catalogFreshness?: CourseCatalogFreshnessReport;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("course_import_batches")
    .insert({
      status: "running",
      mode: "territory_nightly",
      territory: payload.territory,
      seed_phase: payload.phase,
      trigger_type: payload.triggerType,
      max_priority: payload.caps.maxPriorityCourses,
      max_new_seeds: payload.caps.maxNewSeeds,
      max_retries: payload.caps.maxRetries,
      max_refreshes: payload.caps.maxRefreshes,
      summary_json: {
        mode: payload.mode,
        ...(payload.catalogFreshness ? { catalogFreshness: payload.catalogFreshness } : {}),
      },
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to create batch run");
  return String((data as { id: string }).id);
}

async function clearCanonicalApiIdFromOtherCandidates(
  supabase: SupabaseClient,
  territory: string,
  apiId: number,
  keepCandidateId: string,
): Promise<void> {
  if (!Number.isFinite(apiId) || apiId <= 0) return;
  const { error } = await supabase
    .from("course_import_candidates")
    .update({ canonical_api_id: null })
    .eq("territory", territory)
    .eq("canonical_api_id", apiId)
    .neq("id", keepCandidateId);
  if (error) throw new Error(error.message || "Failed to clear duplicate canonical_api_id on peer candidates.");
}

async function updateCandidateAfterAttempt(
  supabase: SupabaseClient,
  candidate: TerritoryCandidateRow,
  payload: {
    status: TerritoryCandidateStatus;
    syncStatus: ImportSyncStatus | "failed" | "queued";
    apiId?: number | null;
    courseId?: string | null;
    confidence?: number | null;
    error?: string | null;
    refreshDueAt?: string | null;
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const retryCount = payload.status === "failed" ? candidate.retry_count + 1 : 0;
  const nextApiId = payload.apiId ?? candidate.canonical_api_id;
  if (nextApiId != null && Number.isFinite(Number(nextApiId)) && Number(nextApiId) > 0) {
    await clearCanonicalApiIdFromOtherCandidates(
      supabase,
      candidate.territory,
      Math.round(Number(nextApiId)),
      candidate.id,
    );
  }
  const { error } = await supabase
    .from("course_import_candidates")
    .update({
      status: payload.status,
      sync_status: payload.syncStatus,
      canonical_api_id: payload.apiId ?? candidate.canonical_api_id,
      canonical_course_id: payload.courseId ?? null,
      confidence_score: payload.confidence ?? null,
      last_synced_at: payload.status === "imported" ? nowIso : candidate.last_synced_at,
      refresh_due_at: payload.status === "imported" ? payload.refreshDueAt ?? null : candidate.refresh_due_at,
      retry_count: retryCount,
      next_retry_at: payload.status === "failed" ? computeRetryDueIso(new Date(), retryCount) : null,
      last_error: payload.error ?? null,
      last_discovered_at: nowIso,
    })
    .eq("id", candidate.id);
  if (error) throw new Error(error.message || "Failed to update candidate");
}

type CourseDetailBindings = {
  candidate: TerritoryCandidateRow | null;
  displayCourseName: string;
  discoverySource: string;
  importPriority: number;
  firstDiscoveredAt: string | null;
  lastDiscoveredAt: string | null;
};

/**
 * Fetches from GolfCourseAPI and persists tees + holes (full detail refresh via `upsertNormalizedImport`).
 */
async function runCourseDetailImportFromApi(
  supabase: SupabaseClient,
  params: {
    batchId: string;
    batchRunId: string;
    phase: TerritorySeedPhase;
    territory: string;
    dryRun: boolean;
    overwriteManualOverrides: boolean;
    triggerType: "manual" | "nightly" | "territory_nightly";
    apiId: number;
    jobId: string | null;
    bindings: CourseDetailBindings;
    catalogStaleSweep?: boolean;
  },
): Promise<{
  result: NightlyImportCourseResult;
  inserted: boolean;
  updated: boolean;
  missingSiCount: number;
}> {
  const sourceType: ImportSourceType = "golfcourseapi";
  const sourceUrl = null;
  const b = params.bindings;
  const seedName = b.displayCourseName;

  try {
    const fetched = await fetchCourseByApiId(params.apiId);
    const normalized = normalizeGolfCourseApiCourse(fetched.course);
    const validationIssues = validateNormalizedImport(normalized);
    const status: "ok" | "partial" = validationIssues.length === 0 ? "ok" : "partial";
    const importedAtIso = new Date().toISOString();
    const confidence = toConfidence(validationIssues);
    const missingSiCount = validationIssues.filter(
      (issue) => issue.code === "SI_OUT_OF_RANGE" || issue.code === "SI_DUPLICATE",
    ).length;

    const { data: existing } = await supabase
      .from("courses")
      .select("id")
      .eq("dedupe_key", normalized.course.dedupeKey)
      .maybeSingle();
    const existedBefore = !!existing;

    let courseId: string | undefined;
    if (!params.dryRun) {
      const persisted = await upsertNormalizedImport(supabase, normalized, {
        sourceType,
        sourceUrl,
        syncStatus: status,
        confidence,
        importedAtIso,
        rawRow: fetched.raw,
        territory: params.territory,
        seedPhase: params.phase,
        discoverySource: b.discoverySource,
        importPriority: b.importPriority,
        refreshDueAt: computeRefreshDueIso(new Date()),
        firstDiscoveredAt: b.firstDiscoveredAt,
        lastDiscoveredAt: b.lastDiscoveredAt ?? importedAtIso,
        canonicalApiId: params.apiId,
        seededStatus: status === "failed" ? "refresh_due" : "seeded",
        discoveryStatus: "resolved",
      });
      courseId = persisted.courseId;
      await applyManualOverrides(supabase, persisted.courseId, params.overwriteManualOverrides);
      if (b.candidate) {
        await updateCandidateAfterAttempt(supabase, b.candidate, {
          status: "imported",
          syncStatus: status,
          apiId: params.apiId,
          courseId,
          confidence,
          refreshDueAt: computeRefreshDueIso(new Date()),
        });
      }
    }

    await updateJob(supabase, params.jobId, {
      target_course_id: courseId ?? null,
      sync_status: status,
      finished_at: new Date().toISOString(),
      imported_at: params.dryRun ? null : importedAtIso,
      confidence_score: confidence,
      validation_errors: validationIssues,
      raw_source_payload: fetched.raw,
      summary: {
        dryRun: params.dryRun,
        teeCount: normalized.tees.length,
        holeCount: normalized.tees.reduce((sum, tee) => sum + tee.holes.length, 0),
        overwriteManualOverrides: params.overwriteManualOverrides,
        candidateId: b.candidate?.id ?? null,
        phase: params.phase,
        territory: params.territory,
        catalogStaleSweep: params.catalogStaleSweep === true,
        detailPersistence: "full",
      },
    });

    return {
      result: {
        courseName: seedName,
        apiId: params.apiId,
        status,
        validationIssues,
        courseId,
      },
      inserted: !existedBefore,
      updated: existedBefore,
      missingSiCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (b.candidate) {
      await updateCandidateAfterAttempt(supabase, b.candidate, {
        status: "failed",
        syncStatus: "failed",
        apiId: params.apiId,
        error: message,
      });
    }
    await updateJob(supabase, params.jobId, {
      sync_status: "failed",
      finished_at: new Date().toISOString(),
      error_message: message,
    });
    return {
      result: {
        courseName: seedName,
        apiId: params.apiId,
        status: "failed",
        validationIssues: [],
        error: message,
      },
      inserted: false,
      updated: false,
      missingSiCount: 0,
    };
  }
}

async function importCatalogStaleCourse(
  supabase: SupabaseClient,
  params: {
    row: StaleCatalogCourseRow;
    batchId: string;
    batchRunId: string;
    phase: TerritorySeedPhase;
    territory: string;
    dryRun: boolean;
    overwriteManualOverrides: boolean;
    triggerType: "manual" | "nightly" | "territory_nightly";
  },
): Promise<{
  result: NightlyImportCourseResult;
  inserted: boolean;
  updated: boolean;
  missingSiCount: number;
}> {
  const sourceType: ImportSourceType = "golfcourseapi";
  const sourceUrl = null;
  const jobId = await insertJobStart(supabase, {
    batchId: params.batchId,
    triggerType: params.triggerType,
    courseName: params.row.courseName,
    apiId: params.row.apiId,
    sourceType,
    sourceUrl,
    batchRunId: params.batchRunId,
    candidateId: null,
    seedPhase: params.phase,
    territory: params.territory,
    mode: "territory_nightly",
  });
  const nowIso = new Date().toISOString();
  return runCourseDetailImportFromApi(supabase, {
    batchId: params.batchId,
    batchRunId: params.batchRunId,
    phase: params.phase,
    territory: params.territory,
    dryRun: params.dryRun,
    overwriteManualOverrides: params.overwriteManualOverrides,
    triggerType: params.triggerType,
    apiId: params.row.apiId,
    jobId,
    bindings: {
      candidate: null,
      displayCourseName: params.row.courseName,
      discoverySource: "catalog_stale_sweep",
      importPriority: 0,
      firstDiscoveredAt: null,
      lastDiscoveredAt: nowIso,
    },
    catalogStaleSweep: true,
  });
}

async function importCandidateCourse(
  supabase: SupabaseClient,
  params: {
    candidate: TerritoryCandidateRow;
    batchId: string;
    batchRunId: string;
    phase: TerritorySeedPhase;
    territory: string;
    dryRun: boolean;
    overwriteManualOverrides: boolean;
    triggerType: "manual" | "nightly" | "territory_nightly";
  },
): Promise<{
  result: NightlyImportCourseResult;
  inserted: boolean;
  updated: boolean;
  missingSiCount: number;
}> {
  const candidate = params.candidate;
  const seed: CourseSeed = {
    name: candidate.candidate_name,
    preferredApiId: candidate.canonical_api_id ?? undefined,
    sourceType: "golfcourseapi",
  };
  const sourceType: ImportSourceType = "golfcourseapi";
  const sourceUrl = null;
  const apiId = await resolveApiId(supabase, seed);
  const jobId = await insertJobStart(supabase, {
    batchId: params.batchId,
    triggerType: params.triggerType,
    courseName: seed.name,
    apiId,
    sourceType,
    sourceUrl,
    batchRunId: params.batchRunId,
    candidateId: candidate.id,
    seedPhase: params.phase,
    territory: params.territory,
    mode: "territory_nightly",
  });

  if (!apiId) {
    const errorMessage = "Unable to resolve GolfCourseAPI id from candidate";
    await updateCandidateAfterAttempt(supabase, candidate, {
      status: "failed",
      syncStatus: "failed",
      error: errorMessage,
    });
    await updateJob(supabase, jobId, {
      sync_status: "failed",
      finished_at: new Date().toISOString(),
      error_message: errorMessage,
    });
    return {
      result: {
        courseName: seed.name,
        apiId: null,
        status: "failed",
        validationIssues: [],
        error: errorMessage,
      },
      inserted: false,
      updated: false,
      missingSiCount: 0,
    };
  }

  return runCourseDetailImportFromApi(supabase, {
    batchId: params.batchId,
    batchRunId: params.batchRunId,
    phase: params.phase,
    territory: params.territory,
    dryRun: params.dryRun,
    overwriteManualOverrides: params.overwriteManualOverrides,
    triggerType: params.triggerType,
    apiId,
    jobId,
    bindings: {
      candidate,
      displayCourseName: seed.name,
      discoverySource: candidate.discovery_source,
      importPriority: candidate.import_priority,
      firstDiscoveredAt: candidate.first_discovered_at,
      lastDiscoveredAt: candidate.last_discovered_at,
    },
    catalogStaleSweep: false,
  });
}

function buildTopFailureReasons(results: NightlyImportCourseResult[]): Array<{ reason: string; count: number }> {
  const byReason = new Map<string, number>();
  for (const row of results) {
    if (row.status !== "failed") continue;
    const reason = (row.error ?? "unknown").slice(0, 180);
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  return [...byReason.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function buildManualReviewItems(
  candidates: TerritoryCandidateRow[],
  results: NightlyImportCourseResult[],
): Array<{ courseName: string; status: ImportSyncStatus; reason: string }> {
  const resultByName = new Map(results.map((row) => [row.courseName.toLowerCase(), row]));
  const ranked = [...candidates].sort((a, b) => b.import_priority - a.import_priority);
  const out: Array<{ courseName: string; status: ImportSyncStatus; reason: string }> = [];
  for (const candidate of ranked) {
    const row = resultByName.get(candidate.candidate_name.toLowerCase());
    if (!row) continue;
    if (row.status === "ok") continue;
    out.push({
      courseName: candidate.candidate_name,
      status: row.status,
      reason: row.error ?? `${row.validationIssues.length} validation issue(s)`,
    });
    if (out.length >= 10) break;
  }
  return out;
}

export async function runTerritoryScaleNightlyImport(
  options?: TerritoryNightlyImportOptions,
): Promise<TerritoryImportOutcome> {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);
  const caps = getTerritoryImportCaps(options?.caps);
  const dryRun = options?.dryRun === true;
  const overwriteManualOverrides = options?.overwriteManualOverrides === true;
  const includeSocietySeeds = options?.includeSocietySeeds !== false;
  const triggerType: "manual" | "nightly" | "territory_nightly" =
    options?.triggerType === "manual" ? "manual" : "territory_nightly";
  const territory = options?.territoryOverride?.trim() || DEFAULT_TERRITORY;
  const phase = await resolveActivePhase(supabase, options?.phaseOverride);
  const batchId = randomUUID();
  const freshnessThresholds = getCourseCatalogFreshnessThresholdsFromEnv({
    ...options?.catalogFreshnessThresholds,
    staleSweepMaxCourses:
      options?.catalogFreshnessThresholds?.staleSweepMaxCourses ?? caps.maxStaleCatalogSweepCourses,
  });
  const catalogFreshness = await evaluateCourseCatalogFreshness(supabase, freshnessThresholds, {
    force: options?.forceCatalogFullRefresh === true,
  });

  console.log(
    `[course-import] Catalog freshness @ ${catalogFreshness.metrics.evaluatedAtIso} | api_courses=${catalogFreshness.metrics.coursesWithApiId} | stale(last_sync<cutoff)=${catalogFreshness.metrics.staleByLastSyncedCount} | missing_SI_courses≈${catalogFreshness.metrics.coursesWithMissingStrokeIndex} | incomplete_tee_courses≈${catalogFreshness.metrics.coursesWithIncompleteTeeBlock} | cutoff=${catalogFreshness.metrics.staleAgeCutoffIso}`,
  );
  if (catalogFreshness.triggeredFullRefresh && options?.forceCatalogFullRefresh === true) {
    console.log(
      `[course-import] Catalog stale sweep FORCED for this run. Reasons: ${catalogFreshness.reasons.join(" | ")}`,
    );
  } else if (catalogFreshness.triggeredFullRefresh) {
    console.log(
      `[course-import] Freshness thresholds crossed (catalog sweep eligible if no queued growth backlog after candidate phases). Reasons: ${catalogFreshness.reasons.join(" | ")}`,
    );
  } else {
    console.log(
      "[course-import] Catalog freshness within thresholds: no catalog-wide stale sweep eligibility from metrics alone.",
    );
  }
  console.log(
    `[course-import] Budgets: newCourseImports<=${caps.maxNewCourseImportAttempts} | staleCandidateRefresh<=${caps.maxStaleCandidateRefreshAttempts} | staleCatalogSweep<=${caps.maxStaleCatalogSweepCourses} (sweep is subordinate to growth unless forced).`,
  );
  console.log(
    "[course-import] Large-catalog note: stale-SI and incomplete-tee metrics use bounded scans; tune COURSE_IMPORT_STALE_SWEEP_MAX_COURSES, COURSE_IMPORT_STALE_AGE_DAYS, and scan caps in courseCatalogFreshness if needed.",
  );

  const batchRunId = await insertBatchRun(supabase, {
    phase,
    territory,
    mode: options?.triggerType ?? "nightly",
    caps,
    triggerType,
    catalogFreshness,
  });

  const discoveredCandidates = await discoverCandidatesBounded(
    supabase,
    phase,
    territory,
    caps,
    includeSocietySeeds,
  );

  const [priorityGrowthCandidates, retryCandidates, newCandidates, refreshCandidates] = await Promise.all([
    listCandidateBucket(supabase, {
      phase,
      territory,
      statuses: ["queued", "resolved", "failed"],
      minPriority: 500,
      limit: Math.max(caps.maxPriorityCourses * 4, 40),
    }),
    listCandidateBucket(supabase, {
      phase,
      territory,
      statuses: ["failed"],
      retryDueOnly: true,
      limit: Math.max(caps.maxRetries * 4, 40),
    }),
    listCandidateBucket(supabase, {
      phase,
      territory,
      statuses: ["queued"],
      limit: Math.max(caps.maxNewSeeds * 5, 80),
    }),
    listCandidateBucket(supabase, {
      phase,
      territory,
      statuses: ["imported"],
      refreshDueOnly: true,
      limit: Math.max(caps.maxRefreshes * 4, 80),
    }),
  ]);

  const growthLimits: CandidatePickLimits = {
    maxTotalAttempts: caps.maxNewCourseImportAttempts,
    maxPriorityCourses: caps.maxPriorityCourses,
    maxNewSeeds: caps.maxNewSeeds,
    maxRetries: caps.maxRetries,
    maxRefreshes: 0,
  };
  const growthPicked = pickCandidates(
    growthLimits,
    priorityGrowthCandidates,
    retryCandidates,
    newCandidates,
    [],
  );

  const growthResults: NightlyImportCourseResult[] = [];
  let growthInserted = 0;
  let growthUpdated = 0;
  let missingSiCount = 0;
  for (const candidate of growthPicked) {
    const imported = await importCandidateCourse(supabase, {
      candidate,
      batchId,
      batchRunId,
      phase,
      territory,
      dryRun,
      overwriteManualOverrides,
      triggerType,
    });
    growthResults.push(imported.result);
    if (imported.inserted) growthInserted += 1;
    if (imported.updated) growthUpdated += 1;
    missingSiCount += imported.missingSiCount;
  }

  const refreshLimits: CandidatePickLimits = {
    maxTotalAttempts: caps.maxStaleCandidateRefreshAttempts,
    maxPriorityCourses: 0,
    maxNewSeeds: 0,
    maxRetries: 0,
    maxRefreshes: caps.maxStaleCandidateRefreshAttempts,
  };
  const refreshPicked = pickCandidates(refreshLimits, [], [], [], refreshCandidates);
  const refreshResults: NightlyImportCourseResult[] = [];
  let refreshInserted = 0;
  let refreshUpdated = 0;
  for (const candidate of refreshPicked) {
    const imported = await importCandidateCourse(supabase, {
      candidate,
      batchId,
      batchRunId,
      phase,
      territory,
      dryRun,
      overwriteManualOverrides,
      triggerType,
    });
    refreshResults.push(imported.result);
    if (imported.inserted) refreshInserted += 1;
    if (imported.updated) refreshUpdated += 1;
    missingSiCount += imported.missingSiCount;
  }

  const queuedCandidatesAfterCandidatePhases = await countQueuedCandidatesForPhase(supabase, phase, territory);
  const forceSweep = options?.forceCatalogFullRefresh === true;
  const shouldConsiderCatalogSweep = catalogFreshness.triggeredFullRefresh;
  let skippedStaleCatalogSweepReason: string | null = null;
  if (!shouldConsiderCatalogSweep) {
    skippedStaleCatalogSweepReason = "freshness_thresholds_not_met";
  } else if (!forceSweep && queuedCandidatesAfterCandidatePhases > 0) {
    skippedStaleCatalogSweepReason = "deferred_growth_queued_backlog";
    console.log(
      `[course-import] Stale catalog sweep skipped: ${queuedCandidatesAfterCandidatePhases} queued candidate(s) remain for this phase (growth-first policy). Use force flag to sweep anyway.`,
    );
  }

  let staleCatalogSweep: StaleCatalogSweepSummary | undefined;
  let sweepInserted = 0;
  let sweepUpdated = 0;
  const pickedApiIds = new Set<number>();
  for (const c of growthPicked) {
    if (c.canonical_api_id != null && c.canonical_api_id > 0) pickedApiIds.add(c.canonical_api_id);
  }
  for (const c of refreshPicked) {
    if (c.canonical_api_id != null && c.canonical_api_id > 0) pickedApiIds.add(c.canonical_api_id);
  }
  for (const r of growthResults) {
    if (r.apiId != null) pickedApiIds.add(r.apiId);
  }
  for (const r of refreshResults) {
    if (r.apiId != null) pickedApiIds.add(r.apiId);
  }

  if (shouldConsiderCatalogSweep && (forceSweep || queuedCandidatesAfterCandidatePhases === 0)) {
    skippedStaleCatalogSweepReason = null;
    const sweepRows = await fetchStaleCatalogCoursesForSweep(supabase, {
      maxRows: caps.maxStaleCatalogSweepCourses,
      staleAgeDays: catalogFreshness.thresholds.staleAgeDays,
    });
    let skippedDuplicateApiInBatch = 0;
    const sweepResults: NightlyImportCourseResult[] = [];
    console.log(
      `[course-import] Stale catalog sweep: selected ${sweepRows.length} course(s) from DB (cap=${caps.maxStaleCatalogSweepCourses}); batch already touched ${pickedApiIds.size} distinct api_id(s).`,
    );
    const sweepStarted = Date.now();
    for (const row of sweepRows) {
      if (pickedApiIds.has(row.apiId)) {
        skippedDuplicateApiInBatch += 1;
        continue;
      }
      pickedApiIds.add(row.apiId);
      const sweepOutcome = await importCatalogStaleCourse(supabase, {
        row,
        batchId,
        batchRunId,
        phase,
        territory,
        dryRun,
        overwriteManualOverrides,
        triggerType,
      });
      sweepResults.push(sweepOutcome.result);
      if (sweepOutcome.inserted) sweepInserted += 1;
      if (sweepOutcome.updated) sweepUpdated += 1;
      missingSiCount += sweepOutcome.missingSiCount;
    }
    staleCatalogSweep = {
      attempted: sweepResults.length,
      skippedDuplicateApiInBatch,
      ok: sweepResults.filter((r) => r.status === "ok").length,
      partial: sweepResults.filter((r) => r.status === "partial").length,
      failed: sweepResults.filter((r) => r.status === "failed").length,
      results: sweepResults,
    };
    console.log(
      `[course-import] Stale catalog sweep finished in ${Date.now() - sweepStarted}ms: attempted=${staleCatalogSweep.attempted} ok=${staleCatalogSweep.ok} partial=${staleCatalogSweep.partial} failed=${staleCatalogSweep.failed} skippedDupApi=${staleCatalogSweep.skippedDuplicateApiInBatch}`,
    );
  } else if (shouldConsiderCatalogSweep) {
    console.log("[course-import] Stale catalog sweep skipped (see skippedStaleCatalogSweepReason in report).");
  } else {
    console.log("[course-import] Stale catalog sweep skipped (freshness thresholds not met).");
  }

  const insertedCoursesFinal = growthInserted + refreshInserted + (staleCatalogSweep ? sweepInserted : 0);
  const updatedCoursesFinal = growthUpdated + refreshUpdated + (staleCatalogSweep ? sweepUpdated : 0);

  const results = [...growthResults, ...refreshResults, ...(staleCatalogSweep?.results ?? [])];
  const ok = results.filter((r) => r.status === "ok").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const staleFailed = staleCatalogSweep?.failed ?? 0;
  const staleOk = staleCatalogSweep?.ok ?? 0;
  const stalePartial = staleCatalogSweep?.partial ?? 0;
  const combinedForFailures = [...results];
  const topFailureReasons = buildTopFailureReasons(combinedForFailures);
  const manualReviewItems = buildManualReviewItems([...growthPicked, ...refreshPicked], [...growthResults, ...refreshResults]);

  const newCourseGrowthSummary: CandidateImportPhaseSummary = {
    attempted: growthResults.length,
    inserted: growthInserted,
    updated: growthUpdated,
    ok: growthResults.filter((r) => r.status === "ok").length,
    partial: growthResults.filter((r) => r.status === "partial").length,
    failed: growthResults.filter((r) => r.status === "failed").length,
  };
  const staleCandidateRefreshSummary: CandidateImportPhaseSummary = {
    attempted: refreshResults.length,
    inserted: refreshInserted,
    updated: refreshUpdated,
    ok: refreshResults.filter((r) => r.status === "ok").length,
    partial: refreshResults.filter((r) => r.status === "partial").length,
    failed: refreshResults.filter((r) => r.status === "failed").length,
  };

  const report: Record<string, unknown> = {
    batchId,
    batchRunId,
    phase,
    territory,
    catalogFreshness,
    staleCatalogSweep: staleCatalogSweep ?? null,
    skippedStaleCatalogSweepReason,
    queuedCandidatesAfterCandidatePhases,
    discoveredCandidates,
    newCourseGrowthPicked: growthPicked.length,
    staleCandidateRefreshPicked: refreshPicked.length,
    attemptedCandidates: growthPicked.length + refreshPicked.length,
    newCourseGrowthSummary,
    staleCandidateRefreshSummary,
    staleCatalogSweepAttempted: staleCatalogSweep?.attempted ?? 0,
    staleCatalogSweepInserted: sweepInserted,
    staleCatalogSweepUpdated: sweepUpdated,
    insertedCourses: insertedCoursesFinal,
    updatedCourses: updatedCoursesFinal,
    ok,
    partial,
    failed,
    skipped,
    staleSweepOk: staleOk,
    staleSweepPartial: stalePartial,
    staleSweepFailed: staleFailed,
    missingSiCount,
    topFailureReasons,
    manualReviewItems,
    generatedAt: new Date().toISOString(),
  };

  await supabase
    .from("course_import_batches")
    .update({
      finished_at: new Date().toISOString(),
      status: failed > 0 ? "failed" : "completed",
      total_candidates: discoveredCandidates,
      total_attempted: growthPicked.length + refreshPicked.length + (staleCatalogSweep?.attempted ?? 0),
      total_inserted: insertedCoursesFinal,
      total_updated: updatedCoursesFinal,
      total_ok: ok,
      total_partial: partial,
      total_failed: failed,
      total_skipped: skipped,
      summary_json: report,
      report_json: report,
    })
    .eq("id", batchRunId);

  return {
    batchId,
    batchRunId,
    phase,
    territory,
    results,
    discoveredCandidates,
    attemptedCandidates: growthPicked.length + refreshPicked.length,
    insertedCourses: insertedCoursesFinal,
    updatedCourses: updatedCoursesFinal,
    missingSiCount,
    topFailureReasons,
    manualReviewItems,
    report,
    catalogFreshness,
    staleCatalogSweep,
    newCourseGrowthSummary,
    staleCandidateRefreshSummary,
    skippedStaleCatalogSweepReason,
    queuedCandidatesAfterCandidatePhases,
  };
}

export { DEFAULT_PRIORITY_SEEDS };
