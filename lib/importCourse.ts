import { supabase } from "@/lib/supabase";
import { importCourseForEventFlow, importCourseFromApiId } from "@/services/courseImportService";
import type { ApiCourse } from "@/lib/golfApi";
import type { ImportedCourse, ImportedTee } from "@/types/course";

export type { ImportedCourse, ImportedTee };

/**
 * Resolve an imported course for UI: prefers DB cache (tees present), otherwise runs full importer.
 */
export async function importCourse(apiCourse: ApiCourse): Promise<ImportedCourse> {
  if (!apiCourse?.id) throw new Error("Invalid GolfCourseAPI course payload.");

  const courseName = (apiCourse.name ?? apiCourse.club_name ?? "Unknown").trim() || "Unknown";
  if (__DEV__) console.log("[importCourse] resolve", { api_id: apiCourse.id, name: courseName });

  try {
    const { data: existing } = await supabase
      .from("courses")
      .select("id, course_name")
      .eq("api_id", apiCourse.id)
      .maybeSingle();

    if (existing) {
      const { data: dbTees } = await supabase
        .from("course_tees")
        .select("id, tee_name, course_rating, slope_rating, par_total, gender, yards")
        .eq("course_id", existing.id)
        .order("display_order", { ascending: true })
        .order("tee_name", { ascending: true });

      if (dbTees && dbTees.length > 0) {
        if (__DEV__) console.log("[importCourse] DB cache hit:", existing.id, dbTees.length, "tees");
        return {
          courseId: existing.id,
          courseName: (existing as { course_name?: string }).course_name ?? courseName,
          tees: dbTees.map((r: any) => ({
            id: r.id,
            teeName: r.tee_name,
            courseRating: r.course_rating ?? null,
            slopeRating: r.slope_rating ?? null,
            parTotal: r.par_total ?? null,
            gender: r.gender ?? null,
            yards: r.yards ?? null,
          })),
          imported: false,
        };
      }
    }
  } catch (e: any) {
    console.warn("[importCourse] DB lookup failed (non-blocking):", e?.message);
  }

  return importCourseForEventFlow(apiCourse);
}

export { importCourseFromApiId };
