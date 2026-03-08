import { supabase } from "@/lib/supabase";

export type CourseLibraryDoc = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  normalized_name: string;
  source_country_code: string;
  updated_at?: string;
};

export type CourseLibrarySummary = {
  coursesCount: number;
  seedRowsCount: number;
  lastImportAt: string | null;
};

export function normalizeCourseName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  limit?: number;
  offset?: number;
}): Promise<CourseLibraryDoc[]> {
  const countryCode = (options?.countryCode ?? "gb").toLowerCase();
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 300);
  const offset = Math.max(options?.offset ?? 0, 0);
  const normalizedQuery = normalizeCourseName(options?.query ?? "");

  let query = supabase
    .from("courses")
    .select("id, name, area, lat, lng, normalized_name, source_country_code, updated_at")
    .eq("source_country_code", countryCode);

  if (normalizedQuery) {
    query = query.ilike("normalized_name", `%${normalizedQuery}%`);
  }

  const { data, error } = await query
    .order("area", { ascending: true })
    .order("normalized_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message || "Failed to load course library");
  }

  return (data ?? []) as CourseLibraryDoc[];
}

export async function getCourseLibrarySummary(countryCode = "gb"): Promise<CourseLibrarySummary> {
  const normalizedCountry = countryCode.toLowerCase();

  const [{ count: coursesCount, error: coursesError }, { count: seedRowsCount, error: seedError }, { data: latestSeed, error: latestError }] =
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
