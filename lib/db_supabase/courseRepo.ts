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
};

export type CourseSearchHit = {
  id: string;
  name: string;
  area?: string | null;
};

/**
 * Fetch tees for a course (from course_tees table).
 */
export async function getTeesByCourseId(courseId: string): Promise<CourseTee[]> {
  const { data, error } = await supabase
    .from("course_tees")
    .select("*")
    .eq("course_id", courseId)
    .order("tee_name");

  if (error) {
    console.error("[courseRepo] getTeesByCourseId failed:", error.message);
    throw new Error(error.message || "Failed to load tees");
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    course_id: row.course_id,
    tee_name: row.tee_name ?? "",
    tee_color: row.tee_color ?? null,
    course_rating: Number(row.course_rating),
    slope_rating: Number(row.slope_rating),
    par_total: Number(row.par_total),
  }));
}

export type SearchCoursesResult = {
  data: CourseSearchHit[];
  error: string | null;
};

/**
 * Search courses by name (for event creation: Search Course → Select Tee).
 * Returns { data, error } so the UI can show "No results" vs "Search failed".
 */
export async function searchCourses(
  query: string,
  limit = 20
): Promise<SearchCoursesResult> {
  const q = (query || "").trim();
  if (!q) return { data: [], error: null };

  const { data, error } = await supabase
    .from("courses")
    .select("id, name, area")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(limit);

  if (error) {
    console.error("[courseRepo] searchCourses failed:", error.message, error.code);
    return { data: [], error: error.message };
  }

  const hits = (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name ?? "",
    area: row.area ?? null,
  }));
  return { data: hits, error: null };
}
