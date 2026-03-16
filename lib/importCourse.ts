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

<<<<<<< HEAD
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
=======
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

/** Slugify for dedupe_key fallback: lowercase, replace non-alphanumeric with hyphen, collapse, trim */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim() || "unknown";
}

/**
 * Build deterministic dedupe_key for courses table (NOT NULL).
 * - If api_id exists: golfcourseapi:{api_id}
 * - Otherwise: slugify(club_name-course_name)
 */
function buildDedupeKey(course: ApiCourse, apiId: number | null): string {
  if (apiId != null) {
    return `golfcourseapi:${apiId}`;
  }
  const club = (course.club_name ?? "").trim();
  const name = (course.name ?? course.course_name ?? "").trim();
  const combined = [club, name].filter(Boolean).join("-") || "unknown";
  return slugify(combined);
}

/**
 * Build courses insert payload: only valid DB columns, no undefined, schema-safe.
 * Includes dedupe_key (NOT NULL required by schema).
 */
function buildCoursePayload(course: ApiCourse): Record<string, unknown> {
  const apiId = safeApiId(course.id);
  const courseName = safeCourseName(course.name);
  const clubName = course.club_name != null ? String(course.club_name).trim() || null : null;
  const lat = safeDouble(getLat(course));
  const lng = safeDouble(getLng(course));
  const dedupeKey = buildDedupeKey(course, apiId);

  const payload: Record<string, unknown> = {
    course_name: courseName,
    club_name: clubName,
    lat,
    lng,
    api_id: apiId,
    dedupe_key: dedupeKey.trim() || "unknown",
  };

  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined) cleaned[k] = v;
  }
  return cleaned;
}
>>>>>>> ca1bb6f25f008b02cd462f3514a4565252022fc2

async function insertCourse(course: ApiCourse): Promise<{ id: string; course_name: string }> {
  const payload = buildCoursePayload(course);

<<<<<<< HEAD
  logSupabaseError("insert", "courses", payload, error as any);

  // Duplicate race condition safety (unique api_id)
  if ((error as any).code === "23505") {
    const existing = await getExistingCourseByApiId(course.id);
    if (existing) return existing;
=======
  if (payload.dedupe_key == null || String(payload.dedupe_key).trim() === "") {
    throw new Error("dedupe_key is required for courses insert");
>>>>>>> ca1bb6f25f008b02cd462f3514a4565252022fc2
  }

  console.log("[importCourse] insertCourse payload", JSON.stringify(payload, null, 2));

  let data: { id: string; course_name: string } | null = null;
  let error: any = null;

  const result = await supabase
    .from("courses")
    .upsert(payload, { onConflict: "dedupe_key" })
    .select("id, course_name")
    .single();
  data = result.data;
  error = result.error;

  if (!error && data) {
    console.log("[importCourse] insertCourse success", { id: data.id, dedupe_key: payload.dedupe_key });
    return data;
  }

  if (error) {
    const code = (error as any).code;
    const msg = error.message;

    if (code === "23505") {
      const existing = await getExistingCourseByApiId(course.id);
      if (existing) return existing;
    }

    if (code === "42P10" || msg?.includes("ON CONFLICT") || msg?.includes("conflict")) {
      console.warn("[importCourse] upsert failed (no dedupe_key unique?), falling back to insert:", msg);
      const insertResult = await supabase
        .from("courses")
        .insert(payload)
        .select("id, course_name")
        .single();
      if (!insertResult.error) return insertResult.data;
      if ((insertResult.error as any).code === "23505") {
        const existing = await getExistingCourseByApiId(course.id);
        if (existing) return existing;
      }
      throw new Error(
        `Course import failed. You can still save the event with manual tee details. ` +
          (insertResult.error?.message ?? "Unknown error")
      );
    }

    console.error("[importCourse] insertCourse FAILED", { code, message: msg });
    throw new Error(
      `Course import failed: ${msg}. You can still save the event with manual tee details.`
    );
  }

  throw new Error("insertCourse: no data returned");
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

<<<<<<< HEAD
    const teePayload = {
      course_id: courseId,
      tee_name: normalized.teeName,
      course_rating: normalized.courseRating,
      slope_rating: normalized.slopeRating != null ? Math.round(normalized.slopeRating) : null,
      par_total: normalized.parTotal != null ? Math.round(normalized.parTotal) : null,
      gender: normalized.gender,
      yards: normalized.yards != null ? Math.round(normalized.yards) : null,
=======
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
>>>>>>> ca1bb6f25f008b02cd462f3514a4565252022fc2
    };

    const { data: teeRow, error: teeError } = await supabase
      .from("course_tees")
<<<<<<< HEAD
      .insert(teePayload)
=======
      .insert(insertPayload)
>>>>>>> ca1bb6f25f008b02cd462f3514a4565252022fc2
      .select("id")
      .single();

    let teeId: string | null = teeRow?.id ?? null;

    if (teeError) {
      console.error("[importCourse] course_tees insert failed", {
        code: (teeError as any).code,
        message: teeError.message,
        tee_name: normalized.teeName,
      });
    }

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

<<<<<<< HEAD
    if (holesError && (holesError as any).code !== "23505") {
      logSupabaseError("insert", "course_holes", { course_id: courseId, tee_id: teeId, holeCount: holeRows.length }, holesError as any);
      throw holesError;
=======
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
>>>>>>> ca1bb6f25f008b02cd462f3514a4565252022fc2
    }

    // Duplicate holes are okay for re-imports if tee already existed.
  }
}

export async function importCourse(apiCourse: ApiCourse): Promise<ImportedCourse> {
  if (!apiCourse?.id) throw new Error("Invalid GolfCourseAPI course payload.");

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

<<<<<<< HEAD
  let tees: ImportedTee[] = [];
  try {
    await importTeesAndHoles(created.id, mergedTees);
    tees = await getImportedTees(created.id);

    if (tees.length === 0 && mergedTees.length > 0) {
=======
  try {
    await importTeesAndHoles(created.id, mergedTees);
  } catch (teeErr: any) {
    console.error("[importCourse] importTeesAndHoles failed, continuing with 0 tees:", teeErr?.message);
    // Course was created; return with empty tees so user can use manual entry
  }

  let tees = await getImportedTees(created.id);

  if (tees.length === 0 && mergedTees.length > 0) {
    try {
>>>>>>> ca1bb6f25f008b02cd462f3514a4565252022fc2
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
<<<<<<< HEAD
    }
  } catch (teeErr: any) {
    console.warn("[importCourse] Tee import failed, returning course with 0 tees:", teeErr?.message);
=======
    } catch (upsertErr: any) {
      console.error("[importCourse] upsertTeesFromApi failed:", upsertErr?.message);
    }
>>>>>>> ca1bb6f25f008b02cd462f3514a4565252022fc2
  }

  console.log("[importCourse] Imported tees:", tees.length, tees.map((t) => `${t.teeName} – CR ${t.courseRating} / SR ${t.slopeRating}`));

  return {
    courseId: created.id,
    courseName: created.course_name ?? "",
    tees,
    imported: true,
  };
}
