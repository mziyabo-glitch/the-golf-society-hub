import { supabase } from "@/lib/supabase";
import type { ApiCourse, ApiTee } from "@/lib/golfApi";

export type ImportedTee = {
  id: string;
  teeName: string;
  courseRating: number | null;
  slopeRating: number | null;
  parTotal: number | null;
  gender?: string | null;
  yards?: number | null;
};

export type ImportedCourse = {
  courseId: string;
  courseName: string;
  tees: ImportedTee[];
  imported: boolean;
};

function safeNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function flattenApiTees(apiCourse: ApiCourse): { teeName: string; courseRating: number | null; slopeRating: number | null; parTotal: number | null; gender: string | null; yards: number | null }[] {
  const t = apiCourse.tees;
  const raw: ApiTee[] = Array.isArray(t)
    ? t
    : [
        ...((t?.male ?? t?.men) ?? []).map((x: ApiTee) => ({ ...x, gender: "M" as const })),
        ...((t?.female ?? t?.women ?? t?.ladies) ?? []).map((x: ApiTee) => ({ ...x, gender: "F" as const })),
      ];

  return raw
    .map((tee) => {
      const baseName = (tee.tee_name || tee.name || (tee as any).name || "").trim();
      if (!baseName) return null;

      const g = tee.gender;
      const gender = g ? (g === "female" ? "F" : g === "male" ? "M" : String(g).charAt(0).toUpperCase()) : null;
      const teeName = gender === "F" && !baseName.includes("(Ladies)") ? `${baseName} (Ladies)` : baseName;
      const yards = tee.total_yards ?? tee.yards ?? (tee as any).yardage ?? (tee as any).total_yards;

      return {
        teeName,
        courseRating: safeNum(tee.course_rating),
        slopeRating: safeNum(tee.slope_rating),
        parTotal: safeNum(tee.par_total ?? (tee as any).par),
        gender,
        yards: safeNum(yards),
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}

/**
 * API-first course import.
 * 1. Parse tees directly from the Golf API response — always works.
 * 2. Try to persist course + tees to Supabase in the background (best-effort).
 * 3. If Supabase already has the course with tees, return those (they have real IDs).
 */
export async function importCourse(apiCourse: ApiCourse): Promise<ImportedCourse> {
  if (!apiCourse?.id) throw new Error("Invalid GolfCourseAPI course payload.");

  const courseName = (apiCourse.name ?? apiCourse.club_name ?? "Unknown").trim() || "Unknown";
  console.log("[importCourse] Import start", { api_id: apiCourse.id, name: courseName });

  // Step 1: Check if Supabase already has this course with tees
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
        .order("tee_name");

      if (dbTees && dbTees.length > 0) {
        console.log("[importCourse] DB cache hit:", existing.id, dbTees.length, "tees");
        return {
          courseId: existing.id,
          courseName: existing.course_name ?? courseName,
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

  // Step 2: Parse tees directly from the API response (always works, no DB needed)
  const apiTees = flattenApiTees(apiCourse);
  console.log("[importCourse] Parsed", apiTees.length, "tees from API:", apiTees.map((t) => t.teeName));

  // Generate temporary IDs so the UI can render tee cards
  const teesWithIds: ImportedTee[] = apiTees.map((t, i) => ({
    id: `api-tee-${apiCourse.id}-${i}`,
    ...t,
  }));

  // Step 3: Try to persist to Supabase in background (best-effort, never blocks UI)
  persistCourseToDb(apiCourse, courseName, apiTees).catch((err) => {
    console.warn("[importCourse] Background DB persist failed (non-blocking):", err?.message);
  });

  return {
    courseId: `api-course-${apiCourse.id}`,
    courseName,
    tees: teesWithIds,
    imported: true,
  };
}

/**
 * Best-effort: persist course and tees to Supabase.
 * Failures are logged but never block the UI.
 */
async function persistCourseToDb(
  apiCourse: ApiCourse,
  courseName: string,
  tees: { teeName: string; courseRating: number | null; slopeRating: number | null; parTotal: number | null; gender: string | null; yards: number | null }[]
): Promise<void> {
  // Try to find or create the course row
  let courseId: string | null = null;

  const { data: existing } = await supabase
    .from("courses")
    .select("id")
    .eq("api_id", apiCourse.id)
    .maybeSingle();

  if (existing) {
    courseId = existing.id;
  } else {
    const normalizedName = courseName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const payload: Record<string, unknown> = {
      course_name: courseName,
      api_id: apiCourse.id,
      dedupe_key: `golfcourseapi:${apiCourse.id}`,
      club_name: apiCourse.club_name ?? null,
      lat: apiCourse.lat ?? apiCourse.latitude ?? null,
      lng: apiCourse.lng ?? apiCourse.longitude ?? null,
      normalized_name: normalizedName,
      source: "golfcourseapi",
      source_country_code: "gb",
      enrichment_status: "imported",
      raw_row: [courseName],
    };

    console.log("[importCourse] persistCourseToDb insert:", payload);
    const { data: row, error } = await supabase
      .from("courses")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      // Duplicate? Try to fetch it
      if ((error as any).code === "23505") {
        const { data: dup } = await supabase.from("courses").select("id").eq("api_id", apiCourse.id).maybeSingle();
        courseId = dup?.id ?? null;
      }
      if (!courseId) {
        console.error("[importCourse] persistCourseToDb insert failed:", error.message);
        return;
      }
    } else {
      courseId = row?.id ?? null;
    }
  }

  if (!courseId) return;

  // Persist tees
  for (const tee of tees) {
    const teePayload = {
      course_id: courseId,
      tee_name: tee.teeName,
      course_rating: tee.courseRating,
      slope_rating: tee.slopeRating != null ? Math.round(tee.slopeRating) : null,
      par_total: tee.parTotal != null ? Math.round(tee.parTotal) : null,
      gender: tee.gender,
      yards: tee.yards != null ? Math.round(tee.yards) : null,
    };

    const { error } = await supabase.from("course_tees").insert(teePayload);
    if (error && (error as any).code !== "23505") {
      console.warn("[importCourse] tee insert failed:", tee.teeName, error.message);
    }
  }

  console.log("[importCourse] persistCourseToDb done:", courseId, tees.length, "tees");
}
