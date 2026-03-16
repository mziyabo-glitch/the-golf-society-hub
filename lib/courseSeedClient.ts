/**
 * Client helper for on-demand course seeding.
 * Calls /api/courses/seed to persist course + tees and enqueue enrichment.
 */
import type { CourseTee } from "@/lib/db_supabase/courseRepo";

export type SeedResult = {
  courseId: string;
  courseName: string;
  tees: Array<{
    id: string;
    teeName: string;
    courseRating: number | null;
    slopeRating: number | null;
    parTotal: number | null;
    gender?: string | null;
    yards?: number | null;
  }>;
  imported: boolean;
};

/**
 * Seed course by api_id. Fetches from Golf API, saves locally, enqueues enrichment.
 * Returns usable data immediately. On failure, returns null (caller can fall back to direct API).
 */
export async function seedCourseByApiId(apiId: number): Promise<SeedResult | null> {
  try {
    const res = await fetch("/api/courses/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_id: apiId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("[courseSeedClient] seed failed:", res.status, err?.error);
      return null;
    }

    const data = await res.json();
    return {
      courseId: data.courseId ?? "",
      courseName: data.courseName ?? "",
      tees: (data.tees ?? []).map((t: any) => ({
        id: t.id ?? `api-${t.teeName}`,
        course_id: data.courseId ?? "",
        tee_name: t.teeName ?? "",
        course_rating: t.courseRating ?? 0,
        slope_rating: t.slopeRating ?? 0,
        par_total: t.parTotal ?? 0,
        gender: t.gender ?? null,
        yards: t.yards ?? null,
      })),
      imported: data.imported ?? false,
    };
  } catch (err) {
    console.warn("[courseSeedClient] seed error:", (err as Error)?.message);
    return null;
  }
}

/**
 * Map SeedResult tees to CourseTee format for CourseTeeSetupCard.
 */
export function seedTeesToCourseTees(seed: SeedResult): CourseTee[] {
  return seed.tees.map((t) => ({
    id: t.id,
    course_id: seed.courseId,
    tee_name: t.teeName,
    tee_color: null,
    course_rating: t.courseRating ?? 0,
    slope_rating: t.slopeRating ?? 0,
    par_total: t.parTotal ?? 0,
    gender: t.gender ?? null,
    yards: t.yards ?? null,
  }));
}
