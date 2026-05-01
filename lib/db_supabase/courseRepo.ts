// Course and course_tees for event setup (search course → select tee)
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase } from "@/lib/supabase";
import { updateEvent } from "@/lib/db_supabase/eventRepo";
import { assertLiveTeeHolesValidForEventAttach } from "@/lib/course/courseTeeHoleValidation";
import { listStaleTeeRows, partitionStaleTeesForImportReconciliation } from "@/lib/course/teeReconciliation";
import type { NormalizedCourseImport, PersistedCourseImport, TeeImportReconciliationStats } from "@/types/course";
import { computeTrustRankForSearchHit } from "@/lib/course/freePlayTrustPresentation";
import type { CourseApprovalState, CourseDataSubmissionType } from "@/types/courseTrust";
import type { EventCourseContext, EventHoleSnapshotRow, EventTeeRatingSnapshot } from "@/types/eventCourseScoring";
import { normalizePlayableCourseNameKey, normalizedLabelMatchScore } from "@/lib/db_supabase/playableCourseNameMatch";

export type { EventCourseContext, EventCourseLiveTee, EventHoleSnapshotRow, EventTeeRatingSnapshot } from "@/types/eventCourseScoring";
export type { CourseApprovalState, CourseDataSubmissionType } from "@/types/courseTrust";

let courseSupabase: SupabaseClient = defaultSupabase;

/**
 * Integration / E2E scripts (e.g. service-role client). Call {@link resetCourseRepoSupabase} in `finally`.
 */
export function setCourseRepoSupabase(client: SupabaseClient): void {
  courseSupabase = client;
}

export function resetCourseRepoSupabase(): void {
  courseSupabase = defaultSupabase;
}

export type CourseTee = {
  id: string;
  course_id: string;
  tee_name: string;
  tee_color?: string | null;
  course_rating: number;
  slope_rating: number;
  par_total: number;
  gender?: string | null;
  yards?: number | null;
  bogey_rating?: number | null;
  total_meters?: number | null;
  is_default?: boolean;
  display_order?: number;
  /** false = archived by import reconciliation; omitted when unknown (pre-migration). */
  is_active?: boolean;
  deactivated_at?: string | null;
};

export type ListCourseTeesOptions = {
  /** When true, include inactive (archived) tees — default false for pickers and scoring prep. */
  includeInactive?: boolean;
};

function mapCourseTeeRow(row: Record<string, unknown>): CourseTee {
  const cr = row.course_rating;
  const sr = row.slope_rating;
  const pt = row.par_total;
  const br = row.bogey_rating;
  const tm = row.total_meters;
  const isActive = row.is_active;
  return {
    id: String(row.id),
    course_id: String(row.course_id),
    tee_name: (row.tee_name as string) ?? "",
    tee_color: (row.tee_color as string | null) ?? null,
    course_rating: cr != null && Number.isFinite(Number(cr)) ? Number(cr) : 0,
    slope_rating: sr != null && Number.isFinite(Number(sr)) ? Number(sr) : 0,
    par_total: pt != null && Number.isFinite(Number(pt)) ? Number(pt) : 0,
    gender: (row.gender as string | null) ?? null,
    yards: (row.yards as number | null) ?? null,
    bogey_rating: br != null && Number.isFinite(Number(br)) ? Number(br) : null,
    total_meters: tm != null && Number.isFinite(Number(tm)) ? Math.round(Number(tm)) : null,
    is_default: row.is_default === true,
    display_order: row.display_order != null && Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : 0,
    is_active: typeof isActive === "boolean" ? isActive : undefined,
    deactivated_at: row.deactivated_at != null ? String(row.deactivated_at) : null,
  };
}

/** One hole row from `course_holes` (WHS / Stableford / stroke index). */
export type CourseHoleRow = {
  id: string;
  course_id: string;
  tee_id: string;
  hole_number: number;
  par: number | null;
  yardage: number | null;
  stroke_index: number | null;
};

export type CourseSearchHit = {
  id: string;
  name: string;
  location?: string | null;
  /** Present when DB has migrations `129` / `133` (`golfer_data_status` on `courses`). */
  golfer_data_status?: "verified" | "partial" | "unverified" | "rejected" | string | null;
  /** Free Play trust sort: 0 global verified, 1 society approved, 2 pending submission, 3 other. */
  trustRank?: number;
  societyApprovedForSociety?: boolean;
  pendingCourseDataReview?: boolean;
};

export type PlayableCourseHit = {
  id: string;
  course_name: string;
  api_id: number | null;
};

/**
 * Fetch tees for a course (from course_tees table).
 * By default returns **active** tees only (`is_active = true`, migration 118) so pickers and scoring
 * do not see stale rows left from older imports. Use {@link ListCourseTeesOptions.includeInactive} for audits.
 * Gracefully handles table-not-found (migration 048 not applied).
 */
export async function getTeesByCourseId(courseId: string, options?: ListCourseTeesOptions): Promise<CourseTee[]> {
  const includeInactive = options?.includeInactive === true;
  console.log("[courseRepo] getTeesByCourseId:", courseId, includeInactive ? "(includeInactive)" : "(active only)");

  let q = courseSupabase
    .from("course_tees")
    .select("*")
    .eq("course_id", courseId)
    .order("display_order", { ascending: true })
    .order("tee_name", { ascending: true });

  if (!includeInactive) {
    q = q.eq("is_active", true);
  }

  const { data, error } = await q;

  if (error) {
    console.error("[courseRepo] getTeesByCourseId failed:", error.message, error.code, error.details);
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      console.warn("[courseRepo] course_tees table does not exist — run migration 048");
      return [];
    }
    if (error.message?.includes("is_active") || (error as { code?: string }).code === "42703") {
      console.warn(
        "[courseRepo] getTeesByCourseId: is_active filter failed — run migration 118_course_tees_import_reconciliation.sql",
      );
      const { data: d2, error: e2 } = await courseSupabase
        .from("course_tees")
        .select("*")
        .eq("course_id", courseId)
        .order("display_order", { ascending: true })
        .order("tee_name", { ascending: true });
      if (e2) {
        if (e2.code === "42P01" || e2.message?.includes("does not exist")) return [];
        throw new Error(e2.message || "Failed to load tees");
      }
      const teesLegacy = (d2 ?? []).map((row: Record<string, unknown>) => mapCourseTeeRow(row));
      console.log("[courseRepo] getTeesByCourseId returned", teesLegacy.length, "tees (legacy, no is_active)");
      return teesLegacy;
    }
    throw new Error(error.message || "Failed to load tees");
  }

  const tees = (data ?? []).map((row: Record<string, unknown>) => mapCourseTeeRow(row));

  console.log("[courseRepo] getTeesByCourseId returned", tees.length, "tees");
  return tees;
}

/** Single tee row (includes inactive) for event context / historical FK resolution. */
export async function getCourseTeeById(teeId: string): Promise<CourseTee | null> {
  if (!teeId) return null;
  const { data, error } = await courseSupabase.from("course_tees").select("*").eq("id", teeId).maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) return null;
    throw new Error(error.message || "Failed to load tee");
  }
  if (!data) return null;
  return mapCourseTeeRow(data as Record<string, unknown>);
}
export type SearchCoursesResult = {
  data: CourseSearchHit[];
  error: string | null;
  /**
   * True when results came from a broad name search because the verified-only query
   * failed (e.g. PostgREST/RLS) or returned no rows and {@link SearchVerifiedCoursesOptions.expandWhenEmpty} applied.
   */
  includedUnverifiedFallback?: boolean;
};

export type SearchVerifiedCoursesOptions = {
  /**
   * When the verified-only query returns zero rows, run {@link searchCourses} so the user can still pick a course.
   * Default true (Free Play).
   */
  expandWhenEmpty?: boolean;
  /**
   * Active society: enriches hits with society approval + pending submission flags and sorts by trust tier.
   */
  societyIdForTrust?: string | null;
};

/** Free Play strict scorecard-ready search (migration `156_free_play_scorecard_ready_search.sql`). */
export type SearchScorecardReadyCoursesOptions = {
  societyIdForTrust?: string | null;
};

export type SearchScorecardReadyCoursesResult = {
  data: CourseSearchHit[];
  error: string | null;
  /**
   * Name matches in the catalog that are not returned (incomplete tee/hole/SI data or duplicate display name).
   * Null when the RPC failed or the query was too short to search.
   */
  hiddenIncompleteMatchCount: number | null;
};

type FreePlaySearchRpcPayload = {
  courses?: Record<string, unknown>[] | null;
  broad_name_match_count?: number | string | null;
  scorecard_ready_name_match_count?: number | string | null;
};

export type CourseWithTees = {
  courseId: string;
  courseName: string;
  tees: CourseTee[];
  fromCache: boolean;
};

export type CourseMeta = {
  id: string;
  course_name: string | null;
  api_id: number | null;
  lat: number | null;
  lng: number | null;
  golfer_data_status?: string | null;
};

/**
 * Get course + tees from DB by GolfCourseAPI id (api_id).
 * Returns null if course not found or has 0 tees (so caller fetches from API).
 */
export async function getCourseByApiId(apiId: number): Promise<CourseWithTees | null> {
  const { data: course, error: courseErr } = await courseSupabase
    .from("courses")
    .select("id, course_name")
    .eq("api_id", apiId)
    .maybeSingle();

  if (courseErr || !course) return null;

  const tees = await getTeesByCourseId(course.id);
  if (tees.length === 0) {
    console.log("[courseRepo] getCourseByApiId: course exists but 0 tees, returning null to trigger API fetch");
    return null;
  }
  return {
    courseId: course.id,
    courseName: course.course_name ?? "",
    tees,
    fromCache: true,
  };
}

export async function getCourseMetaById(courseId: string): Promise<CourseMeta | null> {
  const { data, error } = await courseSupabase
    .from("courses")
    .select("id, course_name, api_id, lat, lng, golfer_data_status")
    .eq("id", courseId)
    .maybeSingle();

  if (error || !data) return null;
  const latRaw = data.lat;
  const lngRaw = data.lng;
  const lat = latRaw != null && Number.isFinite(Number(latRaw)) ? Number(latRaw) : null;
  const lng = lngRaw != null && Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : null;
  const gds = (data as { golfer_data_status?: string | null }).golfer_data_status;
  return {
    id: data.id,
    course_name: data.course_name ?? null,
    api_id: data.api_id != null ? Number(data.api_id) : null,
    lat,
    lng,
    golfer_data_status: gds != null ? String(gds) : null,
  };
}

export type ApiTeeInput = {
  tee_name?: string;
  name?: string;
  course_rating?: number;
  slope_rating?: number;
  par_total?: number;
  par?: number;
  total_yards?: number;
  yards?: number;
  gender?: string;
};

/**
 * Upsert tees from API response into course_tees.
 * Supports male/female and alternate keys (men, women, ladies).
 * Prevents duplicates by (course_id, tee_name) — female tees use "(Ladies)" suffix.
 * Call getTeesByCourseId after to reload.
 */
export async function upsertTeesFromApi(
  courseId: string,
  apiTees: ApiTeeInput[] | { male?: ApiTeeInput[]; female?: ApiTeeInput[]; men?: ApiTeeInput[]; women?: ApiTeeInput[]; ladies?: ApiTeeInput[] }
): Promise<CourseTee[]> {
  const flat: ApiTeeInput[] = Array.isArray(apiTees)
    ? apiTees
    : [
        ...((apiTees?.male ?? apiTees?.men) ?? []).map((t) => ({ ...t, gender: "M" })),
        ...((apiTees?.female ?? apiTees?.women ?? apiTees?.ladies) ?? []).map((t) => ({ ...t, gender: "F" })),
      ];

  if (flat.length === 0) return getTeesByCourseId(courseId);

  const rows = flat
    .map((t) => {
      let teeName = (t.tee_name || t.name || "").trim();
      if (!teeName) return null;
      if (t.gender === "F" || (t.gender && String(t.gender).toUpperCase().startsWith("F"))) {
        if (!teeName.includes("(Ladies)")) teeName = `${teeName} (Ladies)`;
      }
      const yards = t.total_yards ?? t.yards;
      const slope = t.slope_rating;
      const courseRating = t.course_rating;
      const parVal = t.par_total ?? t.par;
      const cr = courseRating != null && Number.isFinite(Number(courseRating)) ? Number(courseRating) : null;
      const sr = slope != null && Number.isFinite(Number(slope)) ? Math.round(Number(slope)) : null;
      const pt = parVal != null && Number.isFinite(Number(parVal)) ? Math.round(Number(parVal)) : null;
      const y = yards != null && Number.isFinite(Number(yards)) ? Math.round(Number(yards)) : null;
      return {
        course_id: courseId,
        tee_name: teeName,
        course_rating: cr,
        slope_rating: sr,
        par_total: pt,
        yards: y,
        gender: t.gender ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  for (const row of rows) {
    const { error } = await courseSupabase.from("course_tees").insert(row);

    if (error) {
      if ((error as any).code === "23505") {
        continue;
      }
      console.warn("[courseRepo] upsertTeesFromApi insert:", error.message, "tee:", row.tee_name);
    }
  }

  return getTeesByCourseId(courseId);
}

function isCoursesTableMissingFromSearch(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "");
  return error.code === "42P01" || msg.includes("does not exist");
}

function logSearchVerifiedFailure(context: string, error: unknown): void {
  const e = error as { message?: string; code?: string; details?: string; hint?: string } | null;
  console.error(
    `[courseRepo] searchVerifiedCourses ${context}:`,
    e?.code,
    e?.message,
    JSON.stringify({ details: e?.details, hint: e?.hint }),
  );
}

function mapDbCourseRowToSearchHit(row: Record<string, unknown>, opts?: { syntheticVerified?: boolean }): CourseSearchHit {
  const location = (row.area || row.city || row.country) ?? null;
  let status: string | null =
    row.golfer_data_status != null && String(row.golfer_data_status).trim() ? String(row.golfer_data_status) : null;
  if (opts?.syntheticVerified && !status) {
    status = "verified";
  }
  return {
    id: String(row.id),
    name: String(row.course_name ?? row.name ?? ""),
    location: location != null ? String(location) : null,
    golfer_data_status: status as CourseSearchHit["golfer_data_status"],
  };
}

/** Active tee row counts per course — used to rank search hits so playable DB rows (e.g. seeded Shrivenham) sort above empty duplicates. */
async function fetchActiveTeeCountsByCourseIds(courseIds: readonly string[]): Promise<Map<string, number>> {
  const ids = [...new Set(courseIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  let { data, error } = await courseSupabase
    .from("course_tees")
    .select("course_id")
    .in("course_id", ids)
    .eq("is_active", true);
  if (
    error &&
    (error.message?.includes("is_active") || (error as { code?: string }).code === "42703")
  ) {
    const legacy = await courseSupabase.from("course_tees").select("course_id").in("course_id", ids);
    data = legacy.data;
    error = legacy.error;
  }
  if (error || !data) {
    if (error) console.warn("[courseRepo] fetchActiveTeeCountsByCourseIds:", error.message);
    return new Map();
  }
  const m = new Map<string, number>();
  for (const row of data as { course_id: string }[]) {
    const id = String(row.course_id);
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

/** Enrich Free Play search hits with society approval + pending submission; sort by trust tier. */
async function enrichAndSortFreePlayCourseHits(
  hits: CourseSearchHit[],
  societyIdForTrust: string | null | undefined,
): Promise<CourseSearchHit[]> {
  if (hits.length === 0) return hits;
  const ids = [...new Set(hits.map((h) => h.id))];
  const teeCounts = await fetchActiveTeeCountsByCourseIds(ids);
  const approvedSet = new Set<string>();
  const pendingSet = new Set<string>();

  if (societyIdForTrust) {
    const { data: appr, error: apprErr } = await courseSupabase
      .from("course_society_approvals")
      .select("course_id")
      .eq("society_id", societyIdForTrust)
      .in("course_id", ids);
    if (apprErr) {
      console.warn("[courseRepo] course_society_approvals read skipped:", apprErr.message);
    } else {
      for (const r of appr ?? []) approvedSet.add(String((r as { course_id: string }).course_id));
    }
  }

  const { data: pend, error: pendErr } = await courseSupabase
    .from("course_data_submissions")
    .select("course_id")
    .eq("status", "pending_review")
    .in("course_id", ids);
  if (pendErr) {
    console.warn("[courseRepo] course_data_submissions read skipped:", pendErr.message);
  } else {
    for (const r of pend ?? []) pendingSet.add(String((r as { course_id: string }).course_id));
  }

  const enriched = hits.map((h) => {
    const societyApprovedForSociety = Boolean(societyIdForTrust && approvedSet.has(h.id));
    const pendingCourseDataReview = pendingSet.has(h.id);
    const trustRank = computeTrustRankForSearchHit({
      golfer_data_status: h.golfer_data_status,
      societyApprovedForSociety,
      pendingCourseDataReview,
    });
    return { ...h, societyApprovedForSociety, pendingCourseDataReview, trustRank };
  });

  return enriched.sort((a, b) => {
    const ta = a.trustRank ?? 3;
    const tb = b.trustRank ?? 3;
    if (ta !== tb) return ta - tb;
    const ca = teeCounts.get(a.id) ?? 0;
    const cb = teeCounts.get(b.id) ?? 0;
    if (cb !== ca) return cb - ca;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Search courses by name (for event creation: Search Course → Select Tee).
 *
 * Selects only `id, name` (always present), then tries to get location
 * from `area`, `city`, or `country` — the schema varies across setups.
 */
export async function searchCourses(
  query: string,
  limit = 20
): Promise<SearchCoursesResult> {
  const q = (query || "").trim();
  if (!q) return { data: [], error: null };

  console.log("[courseRepo] searchCourses:", q);

  // Select all columns (*) so we can pick location from whatever exists
  const pattern = `%${q}%`;
  const escapedPattern = pattern.replace(/,/g, "\\,");
  const { data, error } = await courseSupabase
    .from("courses")
    .select("*")
    .or(`course_name.ilike.${escapedPattern},club_name.ilike.${escapedPattern}`)
    .order("course_name")
    .limit(limit);

  if (error) {
    console.error("[courseRepo] searchCourses failed:", error.message, error.code, error.details);
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return { data: [], error: "courses table not found — run migrations" };
    }
    return { data: [], error: error.message };
  }

  console.log("[courseRepo] searchCourses returned", (data ?? []).length, "hits");

  const hits = (data ?? []).map((row: Record<string, unknown>) => mapDbCourseRowToSearchHit(row));
  return { data: hits, error: null };
}

/**
 * Free Play course search: prefers `courses.golfer_data_status = 'verified'` (migrations 129 / 133).
 *
 * Resilience:
 * - If that filter fails (missing column, PostgREST 400, etc.), logs and immediately uses {@link searchCourses}.
 * - If it succeeds with zero rows and `expandWhenEmpty`, tries `validation_basis = official_only` then
 *   `data_confidence = high` (migrations 130 / 128) before falling back to broad name search.
 */
export async function searchVerifiedCourses(
  query: string,
  limit = 20,
  options?: SearchVerifiedCoursesOptions,
): Promise<SearchCoursesResult> {
  const q = (query || "").trim();
  if (!q) return { data: [], error: null };

  const expandWhenEmpty = options?.expandWhenEmpty !== false;
  const societyTrust = options?.societyIdForTrust ?? null;

  console.log("[courseRepo] searchVerifiedCourses:", q);

  const pattern = `%${q}%`;
  const escapedPattern = pattern.replace(/,/g, "\\,");

  const { data: verifiedRows, error: verifiedError } = await courseSupabase
    .from("courses")
    .select("*")
    .eq("golfer_data_status", "verified")
    .or(`course_name.ilike.${escapedPattern},club_name.ilike.${escapedPattern}`)
    .order("course_name")
    .limit(limit);

  if (verifiedError) {
    logSearchVerifiedFailure("golfer_data_status=verified filter failed (falling back to broad search)", verifiedError);
    if (isCoursesTableMissingFromSearch(verifiedError)) {
      return { data: [], error: "courses table not found — run migrations" };
    }
    const fb = await searchCourses(query, limit);
    return {
      ...fb,
      data: await enrichAndSortFreePlayCourseHits(fb.data ?? [], societyTrust),
      includedUnverifiedFallback: true,
    };
  }

  const verifiedHits = (verifiedRows ?? []).map((row) => mapDbCourseRowToSearchHit(row as Record<string, unknown>));
  if (verifiedHits.length > 0) {
    console.log("[courseRepo] searchVerifiedCourses returned", verifiedHits.length, "verified (golfer_data_status) hits");
    return { data: await enrichAndSortFreePlayCourseHits(verifiedHits, societyTrust), error: null };
  }

  if (!expandWhenEmpty || q.length < 2) {
    return { data: [], error: null };
  }

  const { data: officialRows, error: officialErr } = await courseSupabase
    .from("courses")
    .select("*")
    .eq("validation_basis", "official_only")
    .or(`course_name.ilike.${escapedPattern},club_name.ilike.${escapedPattern}`)
    .order("course_name")
    .limit(limit);

  if (!officialErr && (officialRows?.length ?? 0) > 0) {
    console.log(
      "[courseRepo] searchVerifiedCourses: 0 golfer_data_status=verified rows; using validation_basis=official_only subset",
    );
    const hits = (officialRows ?? []).map((row) =>
      mapDbCourseRowToSearchHit(row as Record<string, unknown>, { syntheticVerified: true }),
    );
    return { data: await enrichAndSortFreePlayCourseHits(hits, societyTrust), error: null, includedUnverifiedFallback: true };
  }
  if (officialErr) {
    logSearchVerifiedFailure("validation_basis=official_only branch skipped", officialErr);
  }

  const { data: highRows, error: highErr } = await courseSupabase
    .from("courses")
    .select("*")
    .eq("data_confidence", "high")
    .or(`course_name.ilike.${escapedPattern},club_name.ilike.${escapedPattern}`)
    .order("course_name")
    .limit(limit);

  if (!highErr && (highRows?.length ?? 0) > 0) {
    console.log(
      "[courseRepo] searchVerifiedCourses: 0 verified/official rows; using data_confidence=high subset",
    );
    const hits = (highRows ?? []).map((row) =>
      mapDbCourseRowToSearchHit(row as Record<string, unknown>, { syntheticVerified: true }),
    );
    return { data: await enrichAndSortFreePlayCourseHits(hits, societyTrust), error: null, includedUnverifiedFallback: true };
  }
  if (highErr) {
    logSearchVerifiedFailure("data_confidence=high branch skipped", highErr);
  }

  console.log("[courseRepo] searchVerifiedCourses: no strict matches, expanding to searchCourses");
  const fb = await searchCourses(query, limit);
  return {
    ...fb,
    data: await enrichAndSortFreePlayCourseHits(fb.data ?? [], societyTrust),
    includedUnverifiedFallback: true,
  };
}

/**
 * Free Play course search: only courses with at least one **strict** scorecard-ready active tee
 * (same tee: CR + slope + par, holes 1–18 with par, stroke index 1–18 integers, no duplicate SI).
 * Excludes courses whose display name collides with another row (duplicate-name review).
 *
 * Uses RPC `free_play_search_scorecard_ready_courses` (single round-trip). If the RPC is missing,
 * returns an empty list and a null hidden count (deploy migration 156).
 */
export async function searchScorecardReadyCourses(
  query: string,
  limit = 20,
  options?: SearchScorecardReadyCoursesOptions,
): Promise<SearchScorecardReadyCoursesResult> {
  const q = (query || "").trim();
  if (!q || q.length < 2) {
    return { data: [], error: null, hiddenIncompleteMatchCount: null };
  }

  const lim = Math.max(1, Math.min(100, limit));
  const societyTrust = options?.societyIdForTrust ?? null;

  const { data: raw, error } = await courseSupabase.rpc("free_play_search_scorecard_ready_courses", {
    p_query: q,
    p_limit: lim,
  });

  if (error) {
    console.error(
      "[courseRepo] searchScorecardReadyCourses RPC failed (run migration 156_free_play_scorecard_ready_search.sql):",
      error.message,
      error.code,
    );
    return { data: [], error: error.message ?? "free_play_search_scorecard_ready_courses failed", hiddenIncompleteMatchCount: null };
  }

  const payload = raw as FreePlaySearchRpcPayload | null;
  const broad = Number(payload?.broad_name_match_count ?? 0);
  const readyTotal = Number(payload?.scorecard_ready_name_match_count ?? 0);
  const hiddenIncompleteMatchCount = Math.max(0, broad - readyTotal);

  const courseRows = Array.isArray(payload?.courses) ? payload!.courses! : [];
  const hits = courseRows.map((row) => mapDbCourseRowToSearchHit(row));
  const data = await enrichAndSortFreePlayCourseHits(hits, societyTrust);

  console.log(
    "[courseRepo] searchScorecardReadyCourses:",
    JSON.stringify({
      query: q,
      readyCourseCountReturned: data.length,
      scorecardReadyNameMatchCount: readyTotal,
      broadNameMatchCount: broad,
      hiddenIncompleteMatchCount,
    }),
  );

  return { data, error: null, hiddenIncompleteMatchCount };
}

/**
 * Trust state for a course in Free Play (global status + society approval + pending submissions).
 */
export async function getCourseApprovalState(
  courseId: string,
  societyId?: string | null,
): Promise<CourseApprovalState | null> {
  const { data: courseRow, error: cErr } = await courseSupabase
    .from("courses")
    .select("id, golfer_data_status")
    .eq("id", courseId)
    .maybeSingle();
  if (cErr || !courseRow) return null;

  const globalStatus =
    (courseRow as { golfer_data_status?: string | null }).golfer_data_status != null
      ? String((courseRow as { golfer_data_status?: string | null }).golfer_data_status)
      : null;

  let societyApproved = false;
  let societyApprovedAt: string | null = null;
  let societyApprovalNotes: string | null = null;
  if (societyId) {
    const { data: appr, error: aErr } = await courseSupabase
      .from("course_society_approvals")
      .select("approved_at, notes")
      .eq("course_id", courseId)
      .eq("society_id", societyId)
      .maybeSingle();
    if (!aErr && appr) {
      societyApproved = true;
      societyApprovedAt = (appr as { approved_at?: string }).approved_at ?? null;
      societyApprovalNotes = (appr as { notes?: string | null }).notes ?? null;
    }
  }

  const { data: pendRows, error: pErr } = await courseSupabase
    .from("course_data_submissions")
    .select("id")
    .eq("course_id", courseId)
    .eq("status", "pending_review")
    .limit(1);
  const pendingSubmission = !pErr && (pendRows?.length ?? 0) > 0;

  return {
    courseId,
    globalStatus,
    societyApproved,
    societyApprovedAt,
    societyApprovalNotes,
    pendingSubmission,
  };
}

export async function approveCourseForSociety(courseId: string, societyId: string, notes?: string | null): Promise<void> {
  const { error } = await courseSupabase.rpc("approve_course_for_society", {
    p_course_id: courseId,
    p_society_id: societyId,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message || "Could not approve course for society.");
}

export async function submitCourseDataReview(input: {
  courseId: string;
  societyId?: string | null;
  submissionType: CourseDataSubmissionType;
  notes?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await courseSupabase.rpc("submit_course_data_review", {
    p_course_id: input.courseId,
    p_society_id: input.societyId ?? null,
    p_submission_type: input.submissionType,
    p_notes: input.notes ?? "",
    p_payload: input.payload ?? {},
  });
  if (error) throw new Error(error.message || "Could not submit course data for review.");
}

export async function reviewCourseDataSubmission(input: {
  submissionId: string;
  decision: "approved" | "rejected";
  reviewNotes?: string | null;
  markCourseStatus?: "verified" | "partial" | "unverified" | "rejected" | null;
}): Promise<void> {
  const { error } = await courseSupabase.rpc("review_course_data_submission", {
    p_submission_id: input.submissionId,
    p_decision: input.decision,
    p_review_notes: input.reviewNotes ?? null,
    p_mark_course_status: input.markCourseStatus ?? null,
  });
  if (error) throw new Error(error.message || "Could not review submission.");
}

/**
 * Resolve the best existing DB course row for scoring metadata by name.
 * Used when legacy rounds point at older duplicate course rows with no tees.
 *
 * Matches both `course_name` and `club_name` so rounds saved as club name (e.g. "Shrivenham Park Golf Club")
 * still resolve to layout rows where the layout is stored under a layout-specific `course_name`
 * (e.g. "Shrivenham Park GC Summer").
 */
export async function findBestPlayableCourseByName(courseName: string): Promise<PlayableCourseHit | null> {
  const q = courseName.trim();
  if (!q) return null;
  const pattern = `%${q}%`;
  const escapedPattern = pattern.replace(/,/g, "\\,");
  const { data, error } = await courseSupabase
    .from("courses")
    .select("id, course_name, club_name, api_id")
    .or(`course_name.ilike.${escapedPattern},club_name.ilike.${escapedPattern}`)
    .limit(40);

  if (error || !data || data.length === 0) return null;

  const targetKey = normalizePlayableCourseNameKey(q);
  const ranked: (PlayableCourseHit & { score: number; teeCount: number })[] = [];
  for (const row of data as {
    id: string;
    course_name: string | null;
    club_name: string | null;
    api_id: number | null;
  }[]) {
    const displayName = String(row.course_name ?? "").trim() || String(row.club_name ?? "").trim();
    if (!displayName) continue;
    const tees = await getTeesByCourseId(String(row.id));
    const teeCount = tees.length;
    if (teeCount === 0) continue;
    const nameKey = normalizePlayableCourseNameKey(String(row.course_name ?? ""));
    const clubKey = normalizePlayableCourseNameKey(String(row.club_name ?? ""));
    const nameScore = Math.max(normalizedLabelMatchScore(targetKey, nameKey), normalizedLabelMatchScore(targetKey, clubKey));
    const hasApi = row.api_id != null ? 10 : 0;
    const score = nameScore + hasApi;
    ranked.push({
      id: String(row.id),
      course_name: displayName,
      api_id: row.api_id != null && Number.isFinite(Number(row.api_id)) ? Number(row.api_id) : null,
      score,
      teeCount,
    });
  }

  if (ranked.length === 0) return null;
  ranked.sort((a, b) => b.score - a.score || b.teeCount - a.teeCount || a.course_name.localeCompare(b.course_name));
  const best = ranked[0];
  return {
    id: best.id,
    course_name: best.course_name,
    api_id: best.api_id,
  };
}

/** Lat/lng + optional contact fields for playability / directions (migration 086+049). */
export type CourseLocationRow = {
  id: string;
  course_name: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website_url: string | null;
  /** GolfCourseAPI id when imported — used to resolve coordinates if lat/lng missing */
  api_id: number | null;
};

export async function getCourseLocationById(courseId: string): Promise<CourseLocationRow | null> {
  const { data, error } = await courseSupabase
    .from("courses")
    .select("id, course_name, lat, lng, phone, website_url, api_id")
    .eq("id", courseId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as any;
  return {
    id: row.id,
    course_name: row.course_name ?? null,
    lat: row.lat != null && Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
    lng: row.lng != null && Number.isFinite(Number(row.lng)) ? Number(row.lng) : null,
    phone: row.phone ?? null,
    website_url: row.website_url ?? null,
    api_id: row.api_id != null && Number.isFinite(Number(row.api_id)) ? Number(row.api_id) : null,
  };
}

// =============================================================================
// GolfCourseAPI import persistence (normalized payload → courses / course_tees / course_holes)
//
// Re-import safety (production-critical):
// 1. `courses` — UPSERT on `dedupe_key` (stable per GolfCourseAPI id). No duplicate course rows.
// 2. `course_tees` — UPSERT on `(course_id, tee_name)` so tee UUIDs stay stable; `events.tee_id` and
//    `event_courses.tee_id` keep pointing at the same row after re-import.
// 3. `course_holes` — DELETE every hole row for this `course_id`, verify count is zero, then INSERT
//    fresh rows per tee. This avoids orphan holes from renamed tees and guarantees one hole set per
//    tee per import pass (no duplicate hole_number rows left behind).
// 4. Tee reconciliation (migration 118 `is_active`) — after each import, `course_tees` rows whose
//    `tee_name` is not in the normalized set are soft-deactivated if still referenced by events /
//    event_courses / event_entries, else hard-deleted. Active pickers use {@link getTeesByCourseId} default.
// =============================================================================

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

async function collectReferencedStaleTeeIds(staleIds: string[]): Promise<Set<string>> {
  const refs = new Set<string>();
  if (staleIds.length === 0) return refs;
  for (const part of chunkIds(staleIds, 80)) {
    const [ev, ec, ee] = await Promise.all([
      courseSupabase.from("events").select("tee_id").in("tee_id", part),
      courseSupabase.from("event_courses").select("tee_id").in("tee_id", part),
      courseSupabase.from("event_entries").select("tee_id").in("tee_id", part),
    ]);
    if (ev.error && ev.error.code !== "42P01" && !ev.error.message?.includes("does not exist")) {
      throw new Error(ev.error.message || "reconcile: failed to scan events for tee references");
    }
    if (ec.error && ec.error.code !== "42P01" && !ec.error.message?.includes("does not exist")) {
      throw new Error(ec.error.message || "reconcile: failed to scan event_courses for tee references");
    }
    if (ee.error && ee.error.code !== "42P01" && !ee.error.message?.includes("does not exist")) {
      throw new Error(ee.error.message || "reconcile: failed to scan event_entries for tee references");
    }
    for (const r of ev.data ?? []) {
      const id = (r as { tee_id?: string | null }).tee_id;
      if (id) refs.add(String(id));
    }
    for (const r of ec.data ?? []) {
      const id = (r as { tee_id?: string | null }).tee_id;
      if (id) refs.add(String(id));
    }
    for (const r of ee.data ?? []) {
      const id = (r as { tee_id?: string | null }).tee_id;
      if (id) refs.add(String(id));
    }
  }
  return refs;
}

/**
 * Align `course_tees` with the normalized importer set: stale rows are deleted or soft-deactivated.
 * Requires migration 118 (`is_active`, `deactivated_at` on `course_tees`).
 */
export async function reconcileCourseTeesAfterNormalizedImport(
  courseId: string,
  normalizedTeeNames: readonly string[],
): Promise<TeeImportReconciliationStats> {
  const { data: allRows, error: readErr } = await courseSupabase
    .from("course_tees")
    .select("id, tee_name")
    .eq("course_id", courseId);

  if (readErr) {
    if (readErr.code === "42P01" || readErr.message?.includes("does not exist")) {
      return {
        normalizedTeeCount: normalizedTeeNames.length,
        dbTeeCountBeforeReconciliation: 0,
        staleDeactivatedCount: 0,
        staleDeletedCount: 0,
        historicalReferencedStaleCount: 0,
        dbActiveTeeCountAfter: 0,
      };
    }
    throw new Error(readErr.message || "reconcile: failed to list course_tees");
  }

  const rows = (allRows ?? []).map((r: { id: unknown; tee_name: unknown }) => ({
    id: String(r.id),
    tee_name: String(r.tee_name ?? ""),
  }));
  const dbTeeCountBeforeReconciliation = rows.length;

  if (normalizedTeeNames.length === 0) {
    const { count: activeOnly, error: actCountErr } = await courseSupabase
      .from("course_tees")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("is_active", true);
    let activeAfter = activeOnly ?? 0;
    if (actCountErr) {
      const missingCol =
        actCountErr.message?.includes("is_active") || (actCountErr as { code?: string }).code === "42703";
      if (missingCol) {
        const { count: allC, error: allErr } = await courseSupabase
          .from("course_tees")
          .select("id", { count: "exact", head: true })
          .eq("course_id", courseId);
        if (allErr) throw new Error(allErr.message || "reconcile: failed to count tees");
        activeAfter = allC ?? dbTeeCountBeforeReconciliation;
      } else {
        throw new Error(actCountErr.message || "reconcile: failed to count active tees");
      }
    }
    return {
      normalizedTeeCount: 0,
      dbTeeCountBeforeReconciliation,
      staleDeactivatedCount: 0,
      staleDeletedCount: 0,
      historicalReferencedStaleCount: 0,
      dbActiveTeeCountAfter: activeAfter,
    };
  }

  const staleRows = listStaleTeeRows(rows, normalizedTeeNames);
  const staleIds = staleRows.map((r) => r.id);
  const referenced = await collectReferencedStaleTeeIds(staleIds);
  const { deactivateIds, deleteIds } = partitionStaleTeesForImportReconciliation(staleRows, referenced);

  const nowIso = new Date().toISOString();
  for (const part of chunkIds(deactivateIds, 80)) {
    const { error: uErr } = await courseSupabase
      .from("course_tees")
      .update({ is_active: false, deactivated_at: nowIso })
      .eq("course_id", courseId)
      .in("id", part);
    if (uErr) throw new Error(uErr.message || "reconcile: failed to deactivate stale tees");
  }

  for (const part of chunkIds(deleteIds, 80)) {
    const { error: dErr } = await courseSupabase.from("course_tees").delete().eq("course_id", courseId).in("id", part);
    if (dErr) throw new Error(dErr.message || "reconcile: failed to delete unreferenced stale tees");
  }

  const names = [...normalizedTeeNames];
  for (const part of chunkIds(names, 80)) {
    const { error: actErr } = await courseSupabase
      .from("course_tees")
      .update({ is_active: true, deactivated_at: null })
      .eq("course_id", courseId)
      .in("tee_name", part);
    if (actErr) throw new Error(actErr.message || "reconcile: failed to reactivate current import tees");
  }

  const { count: activeAfter, error: cErr } = await courseSupabase
    .from("course_tees")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("is_active", true);

  if (cErr) throw new Error(cErr.message || "reconcile: failed to count active tees");

  return {
    normalizedTeeCount: normalizedTeeNames.length,
    dbTeeCountBeforeReconciliation,
    staleDeactivatedCount: deactivateIds.length,
    staleDeletedCount: deleteIds.length,
    historicalReferencedStaleCount: deactivateIds.length,
    dbActiveTeeCountAfter: activeAfter ?? 0,
  };
}

export type ClearCourseHolesForImportResult = {
  ok: boolean;
  countBefore: number;
  /** Prefer header from DELETE when available; may be null on older clients. */
  deletedReported: number | null;
  countAfter: number;
  deleteError: string | null;
};

async function countCourseHolesByCourseId(courseId: string): Promise<number> {
  const { count, error } = await courseSupabase
    .from("course_holes")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId);
  if (error && error.code !== "42P01" && !error.message?.includes("does not exist")) {
    throw new Error(error.message || "count course_holes failed");
  }
  return count ?? 0;
}

async function logCourseHolesClearDiagnostics(courseId: string, remainingCount: number): Promise<void> {
  const { data: tees, error: teeErr } = await courseSupabase
    .from("course_tees")
    .select("id, tee_name")
    .eq("course_id", courseId);
  const { data: samples, error: holeErr } = await courseSupabase
    .from("course_holes")
    .select("id, course_id, tee_id, hole_number, par, yardage, stroke_index")
    .eq("course_id", courseId)
    .order("tee_id", { ascending: true })
    .order("hole_number", { ascending: true })
    .limit(12);

  console.warn("[courseRepo] course_holes DELETE diagnostic (rows still present)", {
    course_id: courseId,
    remaining_rows: remainingCount,
    tee_ids_under_course: (tees ?? []).map((t: { id: string; tee_name: string }) => ({ id: t.id, tee_name: t.tee_name })),
    tee_load_error: teeErr?.message ?? null,
    sample_course_holes: samples ?? [],
    sample_load_error: holeErr?.message ?? null,
    referencing_tables_note:
      "public.event_course_holes does not FK to course_holes; no known FK targets course_holes.id. Orphan rows usually mean RLS blocked DELETE — use service role or apply course_holes_delete_authenticated policy.",
  });
}

/**
 * DELETE FROM course_holes WHERE course_id = :courseId — with counts, logging, and diagnostics.
 * Importers should use the service-role Supabase client ({@link setCourseRepoSupabase}) so RLS does not block DELETE.
 */
export async function clearCourseHolesForImport(courseId: string): Promise<ClearCourseHolesForImportResult> {
  let countBefore = 0;
  try {
    countBefore = await countCourseHolesByCourseId(courseId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[courseRepo] clearCourseHolesForImport: pre-delete count failed", { course_id: courseId, error: msg });
    return {
      ok: false,
      countBefore: -1,
      deletedReported: null,
      countAfter: -1,
      deleteError: msg,
    };
  }

  console.warn("[courseRepo] clearCourseHolesForImport: pre-delete", { course_id: courseId, course_holes_count: countBefore });

  const { error: delErr, count: deletedReported } = await courseSupabase
    .from("course_holes")
    .delete({ count: "exact" })
    .eq("course_id", courseId);

  if (delErr && delErr.code !== "42P01" && !delErr.message?.includes("does not exist")) {
    console.warn("[courseRepo] clearCourseHolesForImport: DELETE request failed", {
      course_id: courseId,
      message: delErr.message,
      code: delErr.code,
    });
    return {
      ok: false,
      countBefore,
      deletedReported: null,
      countAfter: countBefore,
      deleteError: delErr.message ?? "course_holes delete failed",
    };
  }

  let countAfter = 0;
  try {
    countAfter = await countCourseHolesByCourseId(courseId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[courseRepo] clearCourseHolesForImport: post-delete count failed", { course_id: courseId, error: msg });
    return {
      ok: false,
      countBefore,
      deletedReported: deletedReported ?? null,
      countAfter: -1,
      deleteError: msg,
    };
  }

  console.warn("[courseRepo] clearCourseHolesForImport: post-delete", {
    course_id: courseId,
    rows_deleted_reported: deletedReported ?? null,
    course_holes_remaining: countAfter,
  });

  if (countAfter > 0) {
    console.warn("[courseRepo] clearCourseHolesForImport: verification SELECT count(*)", {
      course_id: courseId,
      remaining_count: countAfter,
    });
    await logCourseHolesClearDiagnostics(courseId, countAfter);
  }

  return {
    ok: countAfter === 0 && !delErr,
    countBefore,
    deletedReported: deletedReported ?? null,
    countAfter,
    deleteError: null,
  };
}

/**
 * Remove all hole rows for a course (strict). Throws if any rows remain or delete errors.
 */
export async function deleteHolesForCourse(courseId: string): Promise<void> {
  const r = await clearCourseHolesForImport(courseId);
  if (r.deleteError) throw new Error(r.deleteError);
  if (r.countAfter > 0) {
    throw new Error(
      `${r.countAfter} course_holes rows still exist for course ${courseId} after delete — check RLS DELETE policy and client key (service role bypasses RLS).`,
    );
  }
}

export async function getHolesByTeeId(teeId: string): Promise<CourseHoleRow[]> {
  const { data, error } = await courseSupabase
    .from("course_holes")
    .select("id, course_id, tee_id, hole_number, par, yardage, stroke_index")
    .eq("tee_id", teeId)
    .order("hole_number", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) return [];
    throw new Error(error.message || "Failed to load holes");
  }
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    course_id: String(row.course_id),
    tee_id: String(row.tee_id),
    hole_number: Number(row.hole_number),
    par: row.par != null ? Number(row.par) : null,
    yardage: row.yardage != null ? Number(row.yardage) : null,
    stroke_index: row.stroke_index != null ? Number(row.stroke_index) : null,
  }));
}

export async function getHolesByCourseId(courseId: string): Promise<CourseHoleRow[]> {
  const { data, error } = await courseSupabase
    .from("course_holes")
    .select("id, course_id, tee_id, hole_number, par, yardage, stroke_index")
    .eq("course_id", courseId)
    .order("hole_number", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) return [];
    throw new Error(error.message || "Failed to load holes for course");
  }
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    course_id: String(row.course_id),
    tee_id: String(row.tee_id),
    hole_number: Number(row.hole_number),
    par: row.par != null ? Number(row.par) : null,
    yardage: row.yardage != null ? Number(row.yardage) : null,
    stroke_index: row.stroke_index != null ? Number(row.stroke_index) : null,
  }));
}

export type CourseWithTeesAndHoles = {
  courseId: string;
  courseName: string;
  tees: CourseTee[];
  holesByTeeId: Record<string, CourseHoleRow[]>;
};

export async function getCourseWithTeesAndHoles(courseId: string): Promise<CourseWithTeesAndHoles | null> {
  const { data: c, error } = await courseSupabase.from("courses").select("id, course_name").eq("id", courseId).maybeSingle();
  if (error || !c) return null;
  const tees = await getTeesByCourseId(courseId);
  const holesByTeeId: Record<string, CourseHoleRow[]> = {};
  for (const t of tees) {
    holesByTeeId[t.id] = await getHolesByTeeId(t.id);
  }
  return {
    courseId: c.id,
    courseName: (c as any).course_name ?? "",
    tees,
    holesByTeeId,
  };
}

/**
 * Persist a normalized import package (idempotent on `courses.dedupe_key`).
 * See file header for full re-import strategy.
 * Uses {@link courseSupabase}: for scripted imports prefer {@link setCourseRepoSupabase} with `SUPABASE_SERVICE_ROLE_KEY` so `course_holes` DELETE is not blocked by RLS.
 */
export async function persistNormalizedCourseImport(n: NormalizedCourseImport): Promise<PersistedCourseImport> {
  const coursePayload: Record<string, unknown> = {
    dedupe_key: n.course.dedupeKey,
    course_name: n.course.courseName,
    club_name: n.course.clubName,
    api_id: n.course.apiId,
    full_name: n.course.fullName,
    address: n.course.address,
    city: n.course.city,
    country: n.course.country,
    lat: n.course.latitude,
    lng: n.course.longitude,
    normalized_name: n.course.normalizedNameKey,
    source: n.course.source,
    source_country_code: "gb",
    enrichment_status: "imported",
    raw_row: {},
  };

  const { data: saved, error: upErr } = await courseSupabase
    .from("courses")
    .upsert(coursePayload, { onConflict: "dedupe_key" })
    .select("id, course_name")
    .single();

  if (upErr || !saved) {
    throw new Error(upErr?.message || "persistNormalizedCourseImport: course upsert failed");
  }

  const courseId = String((saved as any).id);
  const courseNameOut = String((saved as any).course_name ?? n.course.courseName);
  const holeClear = await clearCourseHolesForImport(courseId);

  const cannotClearHoles =
    holeClear.deleteError != null ||
    holeClear.countBefore < 0 ||
    holeClear.countAfter < 0 ||
    holeClear.countAfter > 0;

  if (cannotClearHoles) {
    console.warn("[courseRepo] persistNormalizedCourseImport: skip course — failed to clear existing holes", {
      courseId,
      skipped_reason: "failed_to_clear_existing_holes",
      holeClear,
    });
    return {
      courseId,
      apiId: n.course.apiId,
      courseName: courseNameOut,
      teeCount: 0,
      holeCount: 0,
      tees: [],
      skipped_reason: "failed_to_clear_existing_holes",
    };
  }

  let holeTotal = 0;
  const teeOut: PersistedCourseImport["tees"] = [];

  for (const { tee, holes } of n.tees) {
    const teeRow: Record<string, unknown> = {
      course_id: courseId,
      tee_name: tee.teeName,
      course_rating: tee.courseRating,
      bogey_rating: tee.bogeyRating,
      slope_rating: tee.slopeRating,
      par_total: tee.parTotal,
      yards: tee.totalYards,
      total_meters: tee.totalMeters,
      gender: tee.gender,
      tee_color: tee.teeColor,
      is_default: tee.isDefault,
      display_order: tee.displayOrder,
      is_active: true,
      deactivated_at: null,
    };

    const { data: teeSaved, error: teeErr } = await courseSupabase
      .from("course_tees")
      .upsert(teeRow, { onConflict: "course_id,tee_name" })
      .select("id")
      .single();

    if (teeErr || !teeSaved) {
      throw new Error(teeErr?.message || `persistNormalizedCourseImport: tee upsert failed (${tee.teeName})`);
    }

    const teeId = String((teeSaved as any).id);
    const holeRows = holes.map((h) => ({
      course_id: courseId,
      tee_id: teeId,
      hole_number: h.holeNumber,
      par: h.par,
      yardage: h.yardage,
      stroke_index: h.strokeIndex,
    }));

    if (holeRows.length > 0) {
      const { error: hErr } = await courseSupabase.from("course_holes").insert(holeRows);
      if (hErr) {
        throw new Error(hErr.message || `persistNormalizedCourseImport: hole insert failed (${tee.teeName})`);
      }
    }

    holeTotal += holes.length;
    teeOut.push({
      id: teeId,
      teeName: tee.teeName,
      holeCount: holes.length,
      courseRating: tee.courseRating,
      slopeRating: tee.slopeRating,
      parTotal: tee.parTotal,
      gender: tee.gender,
      yards: tee.totalYards,
    });
  }

  const normalizedTeeNames = n.tees.map(({ tee }) => tee.teeName);
  const teeReconciliation =
    normalizedTeeNames.length > 0
      ? await reconcileCourseTeesAfterNormalizedImport(courseId, normalizedTeeNames)
      : undefined;

  return {
    courseId,
    apiId: n.course.apiId,
    courseName: courseNameOut,
    teeCount: teeOut.length,
    holeCount: holeTotal,
    tees: teeOut,
    teeReconciliation,
  };
}

/** DB-backed course picker (already-imported courses). */
export function getCourseOptionsForPicker(query: string, limit = 20): Promise<SearchCoursesResult> {
  return searchCourses(query, limit);
}

/** Tee picker for an imported course UUID (active tees only unless options say otherwise). */
export function getTeeOptionsForCourse(courseId: string, options?: ListCourseTeesOptions): Promise<CourseTee[]> {
  return getTeesByCourseId(courseId, options);
}

/**
 * Lock event to imported course + tee: updates `events` FKs and upserts `event_courses` with an
 * immutable tee metric snapshot (WHS / historical scoring). Re-importing the course must not change
 * past competitions — scoring should prefer {@link EventCourseContext.teeRatingSnapshot}.
 */
export async function attachCourseAndTeeToEvent(
  eventId: string,
  courseId: string,
  teeId: string,
  courseNameDisplay: string,
): Promise<void> {
  if (!eventId || !courseId || !teeId) {
    throw new Error("attachCourseAndTeeToEvent: eventId, courseId, and teeId are required.");
  }

  const { data: teeRow, error: teeReadErr } = await courseSupabase
    .from("course_tees")
    .select("id, course_id, tee_name, course_rating, slope_rating, par_total")
    .eq("id", teeId)
    .maybeSingle();

  if (teeReadErr) {
    console.error("[courseRepo] attachCourseAndTeeToEvent: tee read failed", teeReadErr.message);
    throw new Error(teeReadErr.message || "attachCourseAndTeeToEvent: could not load tee");
  }
  if (!teeRow) {
    throw new Error(`attachCourseAndTeeToEvent: tee ${teeId} not found in course_tees.`);
  }
  if (String((teeRow as { course_id: string }).course_id) !== courseId) {
    throw new Error("attachCourseAndTeeToEvent: tee does not belong to the given course_id.");
  }

  const tr = teeRow as {
    tee_name: string | null;
    course_rating: number | null;
    slope_rating: number | null;
    par_total: number | null;
  };

  const parTotal = tr.par_total != null && Number.isFinite(Number(tr.par_total)) ? Math.round(Number(tr.par_total)) : undefined;
  const courseRating =
    tr.course_rating != null && Number.isFinite(Number(tr.course_rating)) ? Number(tr.course_rating) : undefined;
  const slopeRating =
    tr.slope_rating != null && Number.isFinite(Number(tr.slope_rating)) ? Math.round(Number(tr.slope_rating)) : undefined;

  await updateEvent(eventId, {
    courseId,
    teeId,
    courseName: courseNameDisplay,
    teeName: tr.tee_name?.trim() || undefined,
    par: parTotal,
    courseRating,
    slopeRating,
    teeSource: "imported",
  });

  const { error: delEcErr } = await courseSupabase.from("event_courses").delete().eq("event_id", eventId);
  if (delEcErr && delEcErr.code !== "42P01" && !delEcErr.message?.includes("does not exist")) {
    throw new Error(delEcErr.message || "attachCourseAndTeeToEvent: failed to clear event_courses");
  }

  const { error } = await courseSupabase.from("event_courses").insert({
    event_id: eventId,
    course_id: courseId,
    tee_id: teeId,
    tee_name: tr.tee_name ?? null,
    course_rating: courseRating ?? null,
    slope_rating: slopeRating ?? null,
    par_total: parTotal ?? null,
  });
  if (error && error.code !== "42P01" && !error.message?.includes("does not exist")) {
    console.error("[courseRepo] event_courses insert failed:", error.message);
    throw new Error(error.message || "event_courses insert failed");
  }

  const liveHoles = await getHolesByTeeId(teeId);
  assertLiveTeeHolesValidForEventAttach(liveHoles);

  const { error: delHoleErr } = await courseSupabase.from("event_course_holes").delete().eq("event_id", eventId);
  if (delHoleErr && delHoleErr.code !== "42P01" && !delHoleErr.message?.includes("does not exist")) {
    throw new Error(delHoleErr.message || "attachCourseAndTeeToEvent: failed to clear prior hole snapshot");
  }

  const holePayload = liveHoles.map((h) => ({
    event_id: eventId,
    hole_number: h.hole_number,
    par: Math.round(Number(h.par)),
    yardage: Math.round(Number(h.yardage)),
    stroke_index: Math.round(Number(h.stroke_index)),
  }));

  const { error: insHoleErr } = await courseSupabase.from("event_course_holes").insert(holePayload);
  if (insHoleErr && insHoleErr.code !== "42P01" && !insHoleErr.message?.includes("does not exist")) {
    throw new Error(insHoleErr.message || "attachCourseAndTeeToEvent: failed to insert hole snapshot");
  }
}

export type { TeeHoleRowLike } from "@/lib/course/courseTeeHoleValidation";
export { assertLiveTeeHolesValidForEventAttach } from "@/lib/course/courseTeeHoleValidation";

export type GetEventCourseContextOptions = {
  /**
   * When false, omit live `course_tees` lookup — use only `event_courses` + `event_course_holes` (scoring engine).
   * @default true (UI / pickers may show current tee block from DB).
   */
  includeLiveTee?: boolean;
};

/**
 * Snapshot of what an event is using for slope/rating + per-hole data (for future score entry).
 */
export async function getEventCourseContext(
  eventId: string,
  options?: GetEventCourseContextOptions,
): Promise<EventCourseContext | null> {
  const includeLiveTee = options?.includeLiveTee !== false;

  const { data: ev, error } = await courseSupabase
    .from("events")
    .select("id, course_id, tee_id, course_name")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !ev) return null;

  const courseId = (ev as any).course_id != null ? String((ev as any).course_id) : null;
  const teeId = (ev as any).tee_id != null ? String((ev as any).tee_id) : null;
  const courseName = (ev as any).course_name != null ? String((ev as any).course_name) : null;

  let tee: CourseTee | null = null;
  if (includeLiveTee && teeId) {
    tee = await getCourseTeeById(teeId);
    if (tee && courseId && tee.course_id !== courseId) {
      tee = null;
    }
  }

  const { data: holeRows, error: holeErr } = await courseSupabase
    .from("event_course_holes")
    .select("id, event_id, hole_number, par, yardage, stroke_index")
    .eq("event_id", eventId)
    .order("hole_number", { ascending: true });

  if (holeErr && holeErr.code !== "42P01" && !holeErr.message?.includes("does not exist")) {
    throw new Error(holeErr.message || "getEventCourseContext: failed to load event_course_holes");
  }

  const holes: EventHoleSnapshotRow[] = (holeRows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    event_id: String(r.event_id),
    hole_number: Number(r.hole_number),
    par: Number(r.par),
    yardage: Number(r.yardage),
    stroke_index: Number(r.stroke_index),
  }));

  const { data: ec } = await courseSupabase
    .from("event_courses")
    .select("course_id, tee_id, tee_name, course_rating, slope_rating, par_total")
    .eq("event_id", eventId)
    .maybeSingle();

  const lockRow =
    ec && (ec as any).course_id && (ec as any).tee_id
      ? { course_id: String((ec as any).course_id), tee_id: String((ec as any).tee_id) }
      : null;

  const teeRatingSnapshot: EventTeeRatingSnapshot | null =
    ec &&
    ((ec as any).tee_name != null ||
      (ec as any).course_rating != null ||
      (ec as any).slope_rating != null ||
      (ec as any).par_total != null)
      ? {
          teeName: (ec as any).tee_name != null ? String((ec as any).tee_name) : null,
          courseRating:
            (ec as any).course_rating != null && Number.isFinite(Number((ec as any).course_rating))
              ? Number((ec as any).course_rating)
              : null,
          slopeRating:
            (ec as any).slope_rating != null && Number.isFinite(Number((ec as any).slope_rating))
              ? Math.round(Number((ec as any).slope_rating))
              : null,
          parTotal:
            (ec as any).par_total != null && Number.isFinite(Number((ec as any).par_total))
              ? Math.round(Number((ec as any).par_total))
              : null,
        }
      : null;

  return {
    eventId,
    courseId,
    teeId,
    courseName,
    tee,
    teeRatingSnapshot,
    holes,
    lockRow,
  };
}

