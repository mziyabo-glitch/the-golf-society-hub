import { supabase } from "@/lib/supabase";
import { upsertTeesFromApi } from "@/lib/db_supabase/courseRepo";
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

function getLat(course: ApiCourse): number | null {
  const val = course.lat ?? course.latitude;
  return Number.isFinite(val) ? Number(val) : null;
}

function getLng(course: ApiCourse): number | null {
  const val = course.lng ?? course.longitude;
  return Number.isFinite(val) ? Number(val) : null;
}

function safeNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTee(tee: ApiTee, gender?: "M" | "F"): {
  teeName: string;
  courseRating: number | null;
  slopeRating: number | null;
  parTotal: number | null;
  gender: string | null;
  yards: number | null;
} | null {
  const teeName = (tee.tee_name || tee.name || (tee as any).name || "").trim();
  if (!teeName) return null;

  const g = tee.gender ?? gender;
  const yards = tee.total_yards ?? tee.yards ?? (tee as any).yardage ?? (tee as any).total_yards;

  return {
    teeName,
    courseRating: safeNum(tee.course_rating),
    slopeRating: safeNum(tee.slope_rating),
    parTotal: safeNum(tee.par_total ?? (tee as any).par),
    gender: g ? (g === "female" ? "F" : g === "male" ? "M" : String(g).charAt(0).toUpperCase()) : null,
    yards: safeNum(yards),
  };
}

function logSupabaseError(
  op: string,
  table: string,
  payload: unknown,
  error: { message?: string; code?: string; details?: string }
) {
  console.error(`[importCourse] Supabase ${op} failed:`, {
    table,
    payload: JSON.stringify(payload),
    errorCode: error?.code,
    errorMessage: error?.message,
    errorDetails: error?.details,
  });
}

async function getExistingCourseByApiId(apiId: number) {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .eq("api_id", apiId)
    .maybeSingle();

  if (error) {
    logSupabaseError("select", "courses", { api_id: apiId }, error);
    throw error;
  }
  return data;
}

async function getImportedTees(courseId: string): Promise<ImportedTee[]> {
  const { data, error } = await supabase
    .from("course_tees")
    .select("id, tee_name, course_rating, slope_rating, par_total, gender, yards")
    .eq("course_id", courseId)
    .order("tee_name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    teeName: row.tee_name,
    courseRating: row.course_rating ?? null,
    slopeRating: row.slope_rating ?? null,
    parTotal: row.par_total ?? null,
    gender: row.gender ?? null,
    yards: row.yards ?? null,
  }));
}

async function insertCourse(course: ApiCourse): Promise<{ id: string; course_name: string }> {
  const payload = {
    course_name: (course.name ?? course.club_name ?? "Unknown").trim() || "Unknown",
    club_name: course.club_name ?? null,
    lat: getLat(course),
    lng: getLng(course),
    api_id: course.id,
  };

  console.log("[importCourse] insertCourse payload:", { course_id: course.id, course_name: payload.course_name, payload });

  const { data, error } = await supabase
    .from("courses")
    .insert(payload)
    .select("id, course_name")
    .single();

  if (!error) return data;

  logSupabaseError("insert", "courses", payload, error as any);

  // Duplicate race condition safety (unique api_id)
  if ((error as any).code === "23505") {
    const existing = await getExistingCourseByApiId(course.id);
    if (existing) return existing;
  }

  throw error;
}

async function importTeesAndHoles(
  courseId: string,
  tees: ApiTee[] | undefined,
  gender?: "M" | "F"
): Promise<void> {
  if (!Array.isArray(tees) || tees.length === 0) return;

  for (const tee of tees) {
    const normalized = normalizeTee(tee, gender);
    if (!normalized) continue;

    const teePayload = {
      course_id: courseId,
      tee_name: normalized.teeName,
      course_rating: normalized.courseRating,
      slope_rating: normalized.slopeRating != null ? Math.round(normalized.slopeRating) : null,
      par_total: normalized.parTotal != null ? Math.round(normalized.parTotal) : null,
      gender: normalized.gender,
      yards: normalized.yards != null ? Math.round(normalized.yards) : null,
    };

    const { data: teeRow, error: teeError } = await supabase
      .from("course_tees")
      .insert(teePayload)
      .select("id")
      .single();

    let teeId: string | null = teeRow?.id ?? null;

    if (teeError && (teeError as any).code === "23505") {
      const { data: existingTee, error: existingTeeError } = await supabase
        .from("course_tees")
        .select("id")
        .eq("course_id", courseId)
        .eq("tee_name", normalized.teeName)
        .maybeSingle();
      if (existingTeeError) {
        logSupabaseError("select", "course_tees", { course_id: courseId, tee_name: normalized.teeName }, existingTeeError as any);
        throw existingTeeError;
      }
      teeId = existingTee?.id ?? null;
    } else if (teeError) {
      logSupabaseError("insert", "course_tees", teePayload, teeError as any);
      throw teeError;
    }

    if (!teeId) continue;
    console.log("[importCourse] Imported tee:", normalized.teeName);

    if (!Array.isArray(tee.holes) || tee.holes.length === 0) {
      console.log("[importCourse] tee has no hole data (skipping holes):", normalized.teeName);
      continue;
    }

    const holeRows = tee.holes
      .map((hole: any, i: number) => ({
        course_id: courseId,
        tee_id: teeId,
        hole_number: i + 1,
        par: hole?.par != null ? Number(hole.par) : null,
        yardage: hole?.yardage != null ? Number(hole.yardage) : null,
        stroke_index:
          hole?.handicap != null
            ? Number(hole.handicap)
            : hole?.stroke_index != null
              ? Number(hole.stroke_index)
              : hole?.hcp != null
                ? Number(hole.hcp)
                : null,
      }))
      .filter((h) => Number.isFinite(h.hole_number));

    if (holeRows.length === 0) continue;

    const { error: holesError } = await supabase
      .from("course_holes")
      .insert(holeRows);

    if (holesError && (holesError as any).code !== "23505") {
      logSupabaseError("insert", "course_holes", { course_id: courseId, tee_id: teeId, holeCount: holeRows.length }, holesError as any);
      throw holesError;
    }
  }
}

export async function importCourse(apiCourse: ApiCourse): Promise<ImportedCourse> {
  if (!apiCourse?.id) throw new Error("Invalid GolfCourseAPI course payload.");

  console.log("[importCourse] Import start", {
    api_id: apiCourse.id,
    name: apiCourse.name,
  });

  const existing = await getExistingCourseByApiId(apiCourse.id);
  if (existing) {
    const tees = await getImportedTees(existing.id);
    if (tees.length > 0) {
      console.log("[importCourse] course already exists with tees", existing.id, tees.length);
      return {
        courseId: existing.id,
        courseName: existing.course_name ?? "",
        tees,
        imported: false,
      };
    }
    const mergedTees: ApiTee[] = Array.isArray(apiCourse.tees)
      ? apiCourse.tees
      : [
          ...((apiCourse.tees?.male as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "M" as const })),
          ...((apiCourse.tees?.female as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "F" as const })),
        ];
    let teesAfter: ImportedTee[] = [];
    try {
      await importTeesAndHoles(existing.id, mergedTees);
      teesAfter = await getImportedTees(existing.id);
      if (teesAfter.length === 0 && mergedTees.length > 0) {
        console.log("[importCourse] No tees from re-import, trying upsertTeesFromApi");
        const list = await upsertTeesFromApi(existing.id, apiCourse.tees as any);
        teesAfter = list.map((t) => ({
          id: t.id,
          teeName: t.tee_name,
          courseRating: t.course_rating ?? null,
          slopeRating: t.slope_rating ?? null,
          parTotal: t.par_total ?? null,
          gender: t.gender ?? null,
          yards: t.yards ?? null,
        }));
      }
    } catch (teeErr: any) {
      console.warn("[importCourse] Existing course tee import failed; manual fallback remains available:", teeErr?.message);
      teesAfter = [];
    }
    console.log("[importCourse] re-imported tees:", teesAfter.length, teesAfter.map((t) => t.teeName));
    return {
      courseId: existing.id,
      courseName: existing.course_name ?? "",
      tees: teesAfter,
      imported: false,
    };
  }

  const created = await insertCourse(apiCourse);

  const mergedTees: ApiTee[] = Array.isArray(apiCourse.tees)
    ? apiCourse.tees
    : [
        ...((apiCourse.tees?.male as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "M" as const })),
        ...((apiCourse.tees?.female as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "F" as const })),
      ];

  let tees: ImportedTee[] = [];
  try {
    await importTeesAndHoles(created.id, mergedTees);
    tees = await getImportedTees(created.id);

    if (tees.length === 0 && mergedTees.length > 0) {
      try {
        console.log("[importCourse] No tees from importTeesAndHoles, trying upsertTeesFromApi");
        const list = await upsertTeesFromApi(created.id, apiCourse.tees as any);
        tees = list.map((t) => ({
          id: t.id,
          teeName: t.tee_name,
          courseRating: t.course_rating ?? null,
          slopeRating: t.slope_rating ?? null,
          parTotal: t.par_total ?? null,
          gender: t.gender ?? null,
          yards: t.yards ?? null,
        }));
      } catch (upsertErr: any) {
        console.warn("[importCourse] upsertTeesFromApi failed:", upsertErr?.message);
      }
    }
  } catch (teeErr: any) {
    console.warn("[importCourse] Tee import failed, returning course with 0 tees:", teeErr?.message);
    tees = [];
  }

  console.log("[importCourse] Imported tees:", tees.length, tees.map((t) => `${t.teeName} – CR ${t.courseRating} / SR ${t.slopeRating}`));

  return {
    courseId: created.id,
    courseName: created.course_name ?? "",
    tees,
    imported: true,
  };
}
