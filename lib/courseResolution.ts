/**
 * Course resolution for event tee setup.
 * Bypasses broken Supabase courses fallback. Uses direct Golf API only.
 */
import type { CourseTee } from "@/lib/db_supabase/courseRepo";
import { getCourseById, type ApiCourse } from "@/lib/golfApi";

export type ResolvedCourse = {
  courseId: string;
  courseName: string;
  tees: CourseTee[];
};

function apiTeesToCourseTees(apiCourse: ApiCourse): CourseTee[] {
  const raw = apiCourse.tees;
  const arr = Array.isArray(raw)
    ? raw
    : [
        ...((raw as { male?: any[] })?.male ?? []).map((t: any) => ({ ...t, gender: "M" })),
        ...((raw as { female?: any[] })?.female ?? []).map((t: any) => ({ ...t, gender: "F" })),
      ];
  return arr.map((t: any, i: number) => ({
    id: `api-${t.id ?? i}`,
    course_id: "",
    tee_name: (t.tee_name ?? t.name ?? "").trim() || `Tee ${i + 1}`,
    tee_color: null,
    course_rating: t.course_rating != null ? Number(t.course_rating) : 0,
    slope_rating: t.slope_rating != null ? Number(t.slope_rating) : 0,
    par_total: t.par_total ?? t.par ?? 0,
  })).filter((t) => t.tee_name);
}

/**
 * Resolve course by GolfCourseAPI id. Direct API fetch only — no Supabase courses fallback.
 * Non-blocking: on failure, returns null; caller shows manual entry.
 */
export async function resolveCourseByApiId(apiId: number): Promise<ResolvedCourse | null> {
  try {
    const full: ApiCourse = await getCourseById(apiId);
    const tees = apiTeesToCourseTees(full);
    const courseName = full.name ?? full.club_name ?? "Unknown course";

    console.log("[courseResolution]", {
      localTeeCount: 0,
      eventSnapshotUsed: false,
      directApiAttempted: true,
      manualModeShown: tees.length === 0,
      apiTeeCount: tees.length,
    });

    return {
      courseId: "",
      courseName,
      tees,
    };
  } catch (err) {
    console.log("[courseResolution]", {
      localTeeCount: 0,
      eventSnapshotUsed: false,
      directApiAttempted: true,
      manualModeShown: true,
      error: (err as Error)?.message,
    });
    return null;
  }
}
