/**
 * Course resolution for event tee setup.
 * Single phase: resolve one canonical course, load its tees.
 * Used only when user explicitly selects/changes course — not on event open.
 */
import { getCourseByApiId, getTeesByCourseId, upsertTeesFromApi, type CourseTee } from "@/lib/db_supabase/courseRepo";
import { getCourseById, type ApiCourse } from "@/lib/golfApi";
import { importCourse, type ImportedCourse } from "@/lib/importCourse";

export type ResolvedCourse = {
  courseId: string;
  courseName: string;
  tees: CourseTee[];
};

/**
 * Resolve course by GolfCourseAPI id: reuse existing local course by api_id,
 * else import once. Return canonical course + its tees.
 * Non-blocking: on failure, returns empty tees; caller shows manual entry.
 */
export async function resolveCourseByApiId(apiId: number): Promise<ResolvedCourse | null> {
  try {
    // 1. Try existing local course by api_id
    const cached = await getCourseByApiId(apiId);
    if (cached && cached.tees.length > 0) {
      return {
        courseId: cached.courseId,
        courseName: cached.courseName,
        tees: cached.tees,
      };
    }

    // 2. Fetch from API and import (importCourse does canonical matching)
    const full: ApiCourse = await getCourseById(apiId);
    const result: ImportedCourse = await importCourse(full);

    if (!result.courseId) {
      return {
        courseId: "",
        courseName: result.courseName,
        tees: result.tees.map((t) => ({
          id: t.id,
          course_id: "",
          tee_name: t.teeName,
          tee_color: null,
          course_rating: t.courseRating ?? 0,
          slope_rating: t.slopeRating ?? 0,
          par_total: t.parTotal ?? 0,
        })),
      };
    }

    // 3. Ensure tees in DB; use import result or fetch
    let tees: CourseTee[] = result.tees.map((t) => ({
      id: t.id,
      course_id: result.courseId,
      tee_name: t.teeName,
      tee_color: null,
      course_rating: t.courseRating ?? 0,
      slope_rating: t.slopeRating ?? 0,
      par_total: t.parTotal ?? 0,
    }));

    if (tees.length === 0 && full.tees) {
      await upsertTeesFromApi(result.courseId, full.tees as any);
      tees = await getTeesByCourseId(result.courseId);
    } else if (tees.some((t) => t.id.startsWith("api-") || t.id.startsWith("event-saved-"))) {
      // Import returned API tees (synthetic ids); fetch real ones from DB
      const dbTees = await getTeesByCourseId(result.courseId);
      if (dbTees.length > 0) tees = dbTees;
    }

    return {
      courseId: result.courseId,
      courseName: result.courseName,
      tees,
    };
  } catch (err) {
    console.warn("[courseResolution] resolveCourseByApiId failed:", (err as Error)?.message);
    return null;
  }
}
