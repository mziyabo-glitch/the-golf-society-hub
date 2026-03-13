// Course and course_tees for event setup (search course → select tee)
import { supabase } from "@/lib/supabase";

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
};

export type CourseSearchHit = {
  id: string;
  name: string;
  location?: string | null;
};

/**
 * Fetch tees for a course (from course_tees table).
 * Gracefully handles table-not-found (migration 048 not applied).
 */
export async function getTeesByCourseId(courseId: string): Promise<CourseTee[]> {
  console.log("[courseRepo] getTeesByCourseId:", courseId);

  const { data, error } = await supabase
    .from("course_tees")
    .select("*")
    .eq("course_id", courseId)
    .order("tee_name");

  if (error) {
    console.error("[courseRepo] getTeesByCourseId failed:", error.message, error.code, error.details);
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      console.warn("[courseRepo] course_tees table does not exist — run migration 048");
      return [];
    }
    throw new Error(error.message || "Failed to load tees");
  }

  const tees = (data ?? []).map((row: any) => ({
    id: row.id,
    course_id: row.course_id,
    tee_name: row.tee_name ?? "",
    tee_color: row.tee_color ?? null,
    course_rating: Number(row.course_rating),
    slope_rating: Number(row.slope_rating),
    par_total: Number(row.par_total),
    gender: row.gender ?? null,
    yards: row.yards ?? null,
  }));

  console.log("[courseRepo] getTeesByCourseId returned", tees.length, "tees");
  return tees;
}
export type SearchCoursesResult = {
  data: CourseSearchHit[];
  error: string | null;
};

export type CourseWithTees = {
  courseId: string;
  courseName: string;
  tees: CourseTee[];
  fromCache: boolean;
};

/**
 * Get course + tees from DB by GolfCourseAPI id (api_id).
 * Returns null if course not found or has 0 tees (so caller fetches from API).
 */
export async function getCourseByApiId(apiId: number): Promise<CourseWithTees | null> {
  const { data: course, error: courseErr } = await supabase
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
    courseName: course.course_name ?? course.name ?? "",
    tees,
    fromCache: true,
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
 * Prevents duplicates by checking (course_id, tee_name).
 * Call getTeesByCourseId after to reload.
 */
export async function upsertTeesFromApi(
  courseId: string,
  apiTees: ApiTeeInput[] | { male?: ApiTeeInput[]; female?: ApiTeeInput[] }
): Promise<CourseTee[]> {
  const flat: ApiTeeInput[] = Array.isArray(apiTees)
    ? apiTees
    : [
        ...(apiTees?.male ?? []).map((t) => ({ ...t, gender: "M" })),
        ...(apiTees?.female ?? []).map((t) => ({ ...t, gender: "F" })),
      ];

  if (flat.length === 0) return getTeesByCourseId(courseId);

  const rows = flat
    .map((t) => {
      const teeName = (t.tee_name || t.name || "").trim();
      if (!teeName) return null;
      const yards = t.total_yards ?? t.yards;
      const slope = t.slope_rating;
      const courseRating = t.course_rating;
      return {
        course_id: courseId,
        tee_name: teeName,
        course_rating: courseRating != null ? Number(courseRating) : null,
        slope_rating: slope != null ? Math.round(Number(slope)) : null,
        par_total: t.par_total ?? t.par ?? null,
        yards: yards != null ? Math.round(Number(yards)) : null,
        gender: t.gender ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  for (const row of rows) {
    const { error } = await supabase.from("course_tees").insert(row);

    if (error) {
      if ((error as any).code === "23505") {
        continue;
      }
      console.warn("[courseRepo] upsertTeesFromApi insert:", error.message);
    }
  }

  return getTeesByCourseId(courseId);
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
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .ilike("course_name", `%${q}%`)
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

  const hits = (data ?? []).map((row: any) => {
    const location = row.area || row.city || row.country || null;
    return {
      id: row.id,
      name: row.course_name ?? row.name ?? "",
      location,
    };
  });
  return { data: hits, error: null };
}

