import { supabase } from "@/lib/supabase";
import { upsertTeesFromApi } from "@/lib/db_supabase/courseRepo";
import type { ApiCourse, ApiTee } from "@/lib/golfApi";

const LOG = (label: string, data: unknown) => {
  const str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  console.log(`[importCourse] ${label}:`, str);
};

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

/** Normalize value for DB: never insert undefined; NaN -> null; ensure bigint-safe integer */
function safeApiId(id: unknown): number | null {
  if (id == null) return null;
  const n = Number(id);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

/** Normalize double for DB */
function safeDouble(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/** Build courses insert payload: only known columns, no undefined, schema-safe */
function buildCoursePayload(course: ApiCourse): Record<string, unknown> {
  const apiId = safeApiId(course.id);
  const payload: Record<string, unknown> = {
    course_name: safeCourseName(course.name),
    club_name: course.club_name != null ? String(course.club_name).trim() || null : null,
    lat: safeDouble(getLat(course)),
    lng: safeDouble(getLng(course)),
    api_id: apiId,
  };
  // Remove undefined - Supabase/PostgREST can reject payloads with undefined
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined) cleaned[k] = v;
  }
  return cleaned;
}

async function insertCourse(course: ApiCourse): Promise<{ id: string; course_name: string }> {
  const payload = buildCoursePayload(course);

  if (payload.api_id == null) {
    LOG("insertCourse ABORT - api_id is null/invalid", { courseId: course.id, courseName: course.name });
    throw new Error("Invalid course id from API - cannot insert without api_id");
  }

  LOG("insertCourse payload (full)", payload);
  LOG("insertCourse payload types", {
    course_name: typeof payload.course_name,
    club_name: typeof payload.club_name,
    lat: typeof payload.lat,
    lng: typeof payload.lng,
    api_id: typeof payload.api_id,
    api_id_value: payload.api_id,
  });

  const { data, error } = await supabase
    .from("courses")
    .insert(payload)
    .select("id, course_name")
    .single();

  if (!error) {
    LOG("insertCourse success", { id: data?.id, course_name: data?.course_name });
    return data;
  }

  const errObj = {
    code: (error as any).code,
    message: error.message,
    details: (error as any).details,
    hint: (error as any).hint,
    fullError: JSON.stringify(error),
  };
  LOG("insertCourse FAILED - full error", errObj);
  LOG("insertCourse FAILED - payload that was sent", payload);
  console.error("[importCourse] insertCourse FAILED - do not swallow:", JSON.stringify(errObj, null, 2));

  if ((error as any).code === "23505") {
    const existing = await getExistingCourseByApiId(course.id);
    if (existing) return existing;
  }

  // Fallback: schema may have `name` not `course_name` (migration 056 not run)
  if ((error as any).code === "42703" && (error as any).message?.includes("course_name")) {
    LOG("insertCourse retry with name column (schema fallback)", {});
    const fallbackPayload: Record<string, unknown> = {
      name: payload.course_name,
      club_name: payload.club_name,
      lat: payload.lat,
      lng: payload.lng,
      api_id: payload.api_id,
    };
    const { data: fd, error: fe } = await supabase
      .from("courses")
      .insert(fallbackPayload)
      .select("id, name")
      .single();
    if (!fe) return { id: fd.id, course_name: fd.name ?? String(payload.course_name) };
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

    LOG("importTeesAndHoles tee payload (full)", insertPayload);

    const { data: teeRow, error: teeError } = await supabase
      .from("course_tees")
      .insert(insertPayload)
      .select("id")
      .single();

    let teeId: string | null = teeRow?.id ?? null;

    if (teeError) {
      LOG("course_tees insert FAILED", {
        code: (teeError as any).code,
        message: teeError.message,
        details: (teeError as any).details,
        hint: (teeError as any).hint,
        tee_name: normalized.teeName,
        course_id: courseId,
        payload: insertPayload,
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
  LOG("importCourse RAW API course response", apiCourse);

  if (!apiCourse?.id) throw new Error("Invalid GolfCourseAPI course payload.");

  LOG("importCourse start", {
    api_id: apiCourse.id,
    api_id_type: typeof apiCourse.id,
    name: apiCourse.name,
    hasTees: !!apiCourse.tees,
    teesShape: Array.isArray(apiCourse.tees)
      ? `array[${(apiCourse.tees as any[]).length}]`
      : typeof apiCourse.tees === "object"
        ? `object keys: ${Object.keys(apiCourse.tees as object).join(",")}`
        : "unknown",
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
