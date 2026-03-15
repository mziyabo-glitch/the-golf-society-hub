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
    courseRating: tee.course_rating != null ? Number(tee.course_rating) : null,
    slopeRating: tee.slope_rating != null ? Number(tee.slope_rating) : null,
    parTotal: tee.par_total != null ? Number(tee.par_total) : (tee as any).par != null ? Number((tee as any).par) : null,
    gender: g ? (g === "female" ? "F" : g === "male" ? "M" : String(g).charAt(0).toUpperCase()) : null,
    yards: yards != null ? Number(yards) : null,
  };
}

async function getExistingCourseByApiId(apiId: number) {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .eq("api_id", apiId)
    .maybeSingle();

  if (error) throw error;
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

function safeCourseName(name: unknown): string {
  if (name == null) return "Unknown course";
  const s = String(name).trim();
  return s || "Unknown course";
}

async function insertCourse(course: ApiCourse): Promise<{ id: string; course_name: string }> {
  const courseName = safeCourseName(course.name);
  const payload = {
    course_name: courseName,
    club_name: course.club_name ?? null,
    lat: getLat(course),
    lng: getLng(course),
    api_id: course.id,
  };

  console.log("[importCourse] insertCourse payload:", {
    api_id: payload.api_id,
    course_name: payload.course_name,
    club_name: payload.club_name,
    lat: payload.lat,
    lng: payload.lng,
  });

  const { data, error } = await supabase
    .from("courses")
    .insert(payload)
    .select("id, course_name")
    .single();

  if (!error) {
    console.log("[importCourse] insertCourse success:", data?.id);
    return data;
  }

  console.error("[importCourse] insertCourse failed:", {
    code: (error as any).code,
    message: error.message,
    details: (error as any).details,
    payload,
  });

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

    // Sanitize: avoid NaN, undefined; use null for optional numeric fields
    const cr = normalized.courseRating;
    const sr = normalized.slopeRating;
    const pt = normalized.parTotal;
    const insertPayload = {
      course_id: courseId,
      tee_name: normalized.teeName,
      course_rating: cr != null && Number.isFinite(cr) ? cr : null,
      slope_rating: sr != null && Number.isFinite(sr) ? Math.round(sr) : null,
      par_total: pt != null && Number.isFinite(pt) ? Math.round(pt) : null,
      gender: normalized.gender ?? null,
      yards: normalized.yards != null && Number.isFinite(normalized.yards) ? Math.round(normalized.yards) : null,
    };

    console.log("[importCourse] importTeesAndHoles insert tee:", {
      course_id: courseId,
      tee_name: insertPayload.tee_name,
      course_rating: insertPayload.course_rating,
      slope_rating: insertPayload.slope_rating,
      par_total: insertPayload.par_total,
    });

    const { data: teeRow, error: teeError } = await supabase
      .from("course_tees")
      .insert(insertPayload)
      .select("id")
      .single();

    let teeId: string | null = teeRow?.id ?? null;

    if (teeError) {
      console.error("[importCourse] course_tees insert failed:", {
        code: (teeError as any).code,
        message: teeError.message,
        tee_name: normalized.teeName,
        course_id: courseId,
      });
    }

    if (teeError && (teeError as any).code === "23505") {
      const { data: existingTee, error: existingTeeError } = await supabase
        .from("course_tees")
        .select("id")
        .eq("course_id", courseId)
        .eq("tee_name", normalized.teeName)
        .maybeSingle();
      if (existingTeeError) throw existingTeeError;
      teeId = existingTee?.id ?? null;
    } else if (teeError) {
      throw teeError;
    }

    if (!teeId) continue;
    console.log("Imported tee:", normalized.teeName);

    if (!Array.isArray(tee.holes) || tee.holes.length === 0) {
      console.log("[importCourse] tee has no hole data:", normalized.teeName);
      continue;
    }

    const holeRows = tee.holes
      .map((hole: any, i: number) => {
        const holeNum = i + 1;
        const parVal = hole?.par != null ? Number(hole.par) : null;
        const yardVal = hole?.yardage != null ? Number(hole.yardage) : null;
        const siVal =
          hole?.handicap != null
            ? Number(hole.handicap)
            : hole?.stroke_index != null
              ? Number(hole.stroke_index)
              : hole?.hcp != null
                ? Number(hole.hcp)
                : null;
        return {
          course_id: courseId,
          tee_id: teeId,
          hole_number: holeNum,
          par: parVal != null && Number.isFinite(parVal) ? parVal : null,
          yardage: yardVal != null && Number.isFinite(yardVal) ? yardVal : null,
          stroke_index: siVal != null && Number.isFinite(siVal) ? siVal : null,
        };
      })
      .filter((h) => Number.isFinite(h.hole_number));

    if (holeRows.length === 0) continue;

    const { error: holesError } = await supabase
      .from("course_holes")
      .insert(holeRows);

    if (holesError) {
      console.error("[importCourse] course_holes insert failed:", {
        code: (holesError as any).code,
        message: holesError.message,
        tee_id: teeId,
        holeCount: holeRows.length,
      });
      if ((holesError as any).code !== "23505") {
        throw holesError;
      }
    }

    // Duplicate holes are okay for re-imports if tee already existed.
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
    // Course exists but no tees - re-import from API payload
    console.log("[importCourse] course exists but 0 tees, re-importing tees from API");
    const mergedTees: ApiTee[] = Array.isArray(apiCourse.tees)
      ? apiCourse.tees
      : [
          ...((apiCourse.tees?.male as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "M" as const })),
          ...((apiCourse.tees?.female as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "F" as const })),
        ];
    await importTeesAndHoles(existing.id, mergedTees);
    let teesAfter = await getImportedTees(existing.id);
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

  try {
    await importTeesAndHoles(created.id, mergedTees);
  } catch (teeErr: any) {
    console.error("[importCourse] importTeesAndHoles failed, continuing with 0 tees:", teeErr?.message);
    // Course was created; return with empty tees so user can use manual entry
  }

  let tees = await getImportedTees(created.id);

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
      console.error("[importCourse] upsertTeesFromApi failed:", upsertErr?.message);
    }
  }

  console.log("[importCourse] Imported tees:", tees.length, tees.map((t) => `${t.teeName} – CR ${t.courseRating} / SR ${t.slopeRating}`));

  return {
    courseId: created.id,
    courseName: created.course_name ?? "",
    tees,
    imported: true,
  };
}
