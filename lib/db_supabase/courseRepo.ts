import { supabase } from "@/lib/supabase";
import { normalizeCourseText } from "@/lib/course-normalize";
import type { CandidateTee } from "@/lib/course-enrichment";

export type CourseLibraryDoc = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  normalized_name: string;
  source_country_code: string;
  enrichment_status?: string;
  matched_source?: string | null;
  matched_name?: string | null;
  match_confidence?: number | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  updated_at?: string;
};

export type CourseLibrarySummary = {
  coursesCount: number;
  seedRowsCount: number;
  lastImportAt: string | null;
};

export type CourseTeeDoc = {
  id: string;
  course_id: string;
  tee_name: string;
  tee_color: string | null;
  gender: string | null;
  par: number | null;
  course_rating: number | null;
  slope_rating: number | null;
  source: string | null;
  source_ref: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type CourseEnrichmentRunDoc = {
  id: string;
  course_id: string;
  status: string;
  source: string | null;
  notes: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export function normalizeCourseName(input: string): string {
  return normalizeCourseText(input);
}

export function formatCourseLabel(course: Pick<CourseLibraryDoc, "name" | "area">): string {
  return course.area ? `${course.name} (${course.area})` : course.name;
}

export async function searchCourses(
  query: string,
  options?: { countryCode?: string; limit?: number }
): Promise<CourseLibraryDoc[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const normalizedQuery = normalizeCourseName(trimmed);
  if (!normalizedQuery) return [];

  const countryCode = (options?.countryCode ?? "gb").toLowerCase();
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const searchPattern =
    normalizedQuery.length < 3 ? `${normalizedQuery}%` : `%${normalizedQuery}%`;

  const { data, error } = await supabase
    .from("courses")
    .select("id, name, area, lat, lng, normalized_name, source_country_code, updated_at")
    .eq("source_country_code", countryCode)
    .ilike("normalized_name", searchPattern)
    .order("normalized_name", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Failed to search courses");
  }

  return (data ?? []) as CourseLibraryDoc[];
}

export async function listCoursesForAdmin(options?: {
  query?: string;
  countryCode?: string;
  enrichmentStatus?: string;
  limit?: number;
  offset?: number;
}): Promise<CourseLibraryDoc[]> {
  const countryCode = (options?.countryCode ?? "gb").toLowerCase();
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 300);
  const offset = Math.max(options?.offset ?? 0, 0);
  const normalizedQuery = normalizeCourseName(options?.query ?? "");

  let query = supabase
    .from("courses")
    .select(
      "id, name, area, lat, lng, normalized_name, source_country_code, enrichment_status, matched_source, matched_name, match_confidence, reviewed_at, reviewed_by, updated_at"
    )
    .eq("source_country_code", countryCode);

  if (normalizedQuery) {
    query = query.ilike("normalized_name", `%${normalizedQuery}%`);
  }
  if (options?.enrichmentStatus) {
    query = query.eq("enrichment_status", options.enrichmentStatus);
  }

  const { data, error } = await query
    .order("match_confidence", { ascending: false, nullsFirst: false })
    .order("area", { ascending: true })
    .order("normalized_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message || "Failed to load course library");
  }

  return (data ?? []) as CourseLibraryDoc[];
}

export async function getCourseById(courseId: string): Promise<CourseLibraryDoc | null> {
  const { data, error } = await supabase
    .from("courses")
    .select(
      "id, name, area, lat, lng, normalized_name, source_country_code, enrichment_status, matched_source, matched_name, match_confidence, reviewed_at, reviewed_by, updated_at"
    )
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load course");
  }
  return (data as CourseLibraryDoc | null) ?? null;
}

export async function listCourseTees(courseId: string): Promise<CourseTeeDoc[]> {
  if (!courseId) return [];
  const { data, error } = await supabase
    .from("tees")
    .select("*")
    .eq("course_id", courseId)
    .order("is_verified", { ascending: false })
    .order("gender", { ascending: true })
    .order("tee_name", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load tee sets");
  }
  return (data ?? []) as CourseTeeDoc[];
}

export async function getLatestEnrichmentRun(
  courseId: string
): Promise<CourseEnrichmentRunDoc | null> {
  if (!courseId) return null;
  const { data, error } = await supabase
    .from("course_enrichment_runs")
    .select("*")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load enrichment run");
  }
  return (data as CourseEnrichmentRunDoc | null) ?? null;
}

export async function createManualTeeRow(
  courseId: string,
  tee: {
    tee_name: string;
    tee_color?: string | null;
    gender?: string | null;
    par?: number | null;
    course_rating?: number | null;
    slope_rating?: number | null;
    source?: string | null;
    source_ref?: string | null;
    is_verified?: boolean;
  }
): Promise<CourseTeeDoc> {
  const payload = {
    course_id: courseId,
    tee_name: tee.tee_name.trim(),
    tee_color: tee.tee_color?.trim() || null,
    gender: tee.gender?.trim() || "mixed",
    par: tee.par ?? null,
    course_rating: tee.course_rating ?? null,
    slope_rating: tee.slope_rating ?? null,
    source: tee.source ?? "manual_admin",
    source_ref: tee.source_ref ?? null,
    is_verified: tee.is_verified ?? true,
  };

  const { data, error } = await supabase
    .from("tees")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(error.message || "Failed to add tee row");
  }

  return data as CourseTeeDoc;
}

export async function applyMatchAcceptance(
  courseId: string,
  options: {
    reviewedBy: string;
    matchedName?: string | null;
    matchedSource?: string | null;
    matchConfidence?: number | null;
    tees?: CandidateTee[];
  }
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("courses")
    .update({
      enrichment_status: "matched",
      matched_name: options.matchedName ?? null,
      matched_source: options.matchedSource ?? null,
      match_confidence: options.matchConfidence ?? null,
      reviewed_at: nowIso,
      reviewed_by: options.reviewedBy,
      updated_at: nowIso,
    })
    .eq("id", courseId);

  if (updateError) {
    throw new Error(updateError.message || "Failed to accept match");
  }

  const teeRows = (options.tees ?? [])
    .filter((tee) => tee.tee_name && tee.tee_name.trim().length > 0)
    .map((tee, index) => ({
      course_id: courseId,
      tee_name: tee.tee_name.trim(),
      tee_color: tee.tee_color ?? null,
      gender: tee.gender ?? "mixed",
      par: tee.par ?? null,
      course_rating: tee.course_rating ?? null,
      slope_rating: tee.slope_rating ?? null,
      source: tee.source ?? options.matchedSource ?? "enrichment_match",
      source_ref: tee.source_ref ?? `${courseId}:tee:${index + 1}`,
      is_verified: true,
    }));

  if (teeRows.length > 0) {
    const { error: teeError } = await supabase
      .from("tees")
      .upsert(teeRows, { onConflict: "course_id,source,source_ref" });

    if (teeError) {
      throw new Error(teeError.message || "Failed to save tee rows");
    }
  }
}

export async function rejectCourseMatch(courseId: string, reviewedBy: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("courses")
    .update({
      enrichment_status: "needs_review",
      reviewed_at: nowIso,
      reviewed_by: reviewedBy,
      updated_at: nowIso,
    })
    .eq("id", courseId);
  if (error) {
    throw new Error(error.message || "Failed to reject match");
  }
}

export async function markCourseEnrichmentComplete(
  courseId: string,
  reviewedBy: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("courses")
    .update({
      enrichment_status: "complete",
      reviewed_at: nowIso,
      reviewed_by: reviewedBy,
      updated_at: nowIso,
    })
    .eq("id", courseId);
  if (error) {
    throw new Error(error.message || "Failed to mark course complete");
  }
}

export async function updateCourseMatchedName(
  courseId: string,
  matchedName: string,
  reviewedBy: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("courses")
    .update({
      matched_name: matchedName.trim(),
      reviewed_by: reviewedBy,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", courseId);
  if (error) {
    throw new Error(error.message || "Failed to update matched name");
  }
}

export async function getCourseLibrarySummary(countryCode = "gb"): Promise<CourseLibrarySummary> {
  const normalizedCountry = countryCode.toLowerCase();

  const [
    { count: coursesCount, error: coursesError },
    { count: seedRowsCount, error: seedError },
    { data: latestSeed, error: latestError },
  ] =
    await Promise.all([
      supabase
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("source_country_code", normalizedCountry),
      supabase
        .from("courses_seed")
        .select("id", { count: "exact", head: true })
        .eq("source_country_code", normalizedCountry),
      supabase
        .from("courses_seed")
        .select("imported_at")
        .eq("source_country_code", normalizedCountry)
        .order("imported_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (coursesError) {
    throw new Error(coursesError.message || "Failed to load course count");
  }
  if (seedError) {
    throw new Error(seedError.message || "Failed to load seed row count");
  }
  if (latestError) {
    throw new Error(latestError.message || "Failed to load import timestamp");
  }

  return {
    coursesCount: coursesCount ?? 0,
    seedRowsCount: seedRowsCount ?? 0,
    lastImportAt: latestSeed?.imported_at ?? null,
  };
}
