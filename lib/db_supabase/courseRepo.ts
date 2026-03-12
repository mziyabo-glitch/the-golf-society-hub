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
 * Use for cache-first: if course was previously imported, skip API call.
 */
export async function getCourseByApiId(apiId: number): Promise<CourseWithTees | null> {
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, name")
    .eq("api_id", apiId)
    .maybeSingle();

  if (courseErr || !course) return null;

  const tees = await getTeesByCourseId(course.id);
  return {
    courseId: course.id,
    courseName: course.name ?? "",
    tees,
    fromCache: true,
  };
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
    .ilike("name", `%${q}%`)
    .order("name")
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
      name: row.name ?? "",
      location,
    };
  });
  return { data: hits, error: null };
}

