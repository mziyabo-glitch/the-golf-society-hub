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
  const name = (course.name ?? (course as any).course_name ?? "").trim();
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

function logSupabaseError(label: string, error: any, extra?: Record<string, unknown>) {
  console.error(`[importCourse] ${label}`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    ...(extra ?? {}),
  });
  try {
    console.error(`[importCourse] ${label} FULL ERROR:`, JSON.stringify(error, null, 2));
  } catch {
    console.error(`[importCourse] ${label} (not serializable):`, String(error));
  }
}

async function selectCourseByDedupeKey(
  dedupeKey: string
): Promise<{ id: string; course_name: string } | null> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (error) {
    logSupabaseError("selectCourseByDedupeKey failed", error, { dedupe_key: dedupeKey });
    return null;
  }
  return data;
}

async function insertCourse(course: ApiCourse): Promise<{ id: string; course_name: string }> {
  const payload = buildCoursePayload(course);

  if (payload.dedupe_key == null || String(payload.dedupe_key).trim() === "") {
    throw new Error("dedupe_key is required for courses insert");
  }

  console.log("[importCourse] insertCourse payload:", JSON.stringify(payload, null, 2));

  // ─── Strategy 1: select-then-insert (safe fallback, no ON CONFLICT needed) ───
  console.log("[importCourse] STRATEGY: select-then-insert fallback (dedupe_key =", payload.dedupe_key, ")");

  const existing = await selectCourseByDedupeKey(String(payload.dedupe_key));
  if (existing) {
    console.log("[importCourse] select-then-insert: found existing course by dedupe_key", {
      id: existing.id,
      course_name: existing.course_name,
      dedupe_key: payload.dedupe_key,
    });
    return existing;
  }

  // Also check by api_id as secondary lookup
  if (course.id) {
    const byApiId = await getExistingCourseByApiId(course.id);
    if (byApiId) {
      console.log("[importCourse] select-then-insert: found existing course by api_id", {
        id: byApiId.id,
        api_id: course.id,
      });
      return byApiId;
    }
  }

  // ─── Strategy 2: plain insert (no upsert, no ON CONFLICT) ───
  console.log("[importCourse] STRATEGY: plain insert (no existing row found)");
  const insertResult = await supabase
    .from("courses")
    .insert(payload)
    .select("id, course_name")
    .single();

  if (!insertResult.error && insertResult.data) {
    console.log("[importCourse] plain insert success", {
      id: insertResult.data.id,
      dedupe_key: payload.dedupe_key,
    });
    return insertResult.data;
  }

  if (insertResult.error) {
    logSupabaseError("plain insert FAILED", insertResult.error, {
      supabase_call: "supabase.from('courses').insert(payload).select('id, course_name').single()",
      payload_keys: Object.keys(payload),
      dedupe_key: payload.dedupe_key,
    });

    // 23505 = unique violation — row was inserted concurrently; re-select
    if (insertResult.error.code === "23505") {
      console.log("[importCourse] 23505 unique violation on insert, re-selecting...");
      const raceWinner =
        (await selectCourseByDedupeKey(String(payload.dedupe_key))) ||
        (course.id ? await getExistingCourseByApiId(course.id) : null);
      if (raceWinner) return raceWinner;
    }

    // ─── Strategy 3: upsert as last resort ───
    console.log("[importCourse] STRATEGY: upsert on dedupe_key (last resort)");
    const upsertResult = await supabase
      .from("courses")
      .upsert(payload, { onConflict: "dedupe_key" })
      .select("id, course_name")
      .single();

    if (!upsertResult.error && upsertResult.data) {
      console.log("[importCourse] upsert success", {
        id: upsertResult.data.id,
        dedupe_key: payload.dedupe_key,
      });
      return upsertResult.data;
    }

    if (upsertResult.error) {
      logSupabaseError("upsert ALSO FAILED", upsertResult.error, {
        supabase_call: "supabase.from('courses').upsert(payload, { onConflict: 'dedupe_key' })",
        dedupe_key: payload.dedupe_key,
      });
    }

    throw new Error(
      `Course import failed: ${insertResult.error.message}. ` +
        `code=${insertResult.error.code}, details=${insertResult.error.details ?? "none"}, ` +
        `hint=${(insertResult.error as any).hint ?? "none"}. ` +
        `You can still save the event with manual tee details.`
    );
  }

  throw new Error("insertCourse: no data returned from insert");
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

    const { data: teeRow, error: teeError } = await supabase
      .from("course_tees")
      .insert(insertPayload)
      .select("id")
      .single();

    let teeId: string | null = teeRow?.id ?? null;

    if (teeError) {
      logSupabaseError("course_tees insert failed", teeError, {
        supabase_call: "supabase.from('course_tees').insert()",
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
      logSupabaseError("course_holes insert failed", holesError, {
        supabase_call: "supabase.from('course_holes').insert()",
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

  let created: { id: string; course_name: string } | null = null;
  let courseInsertError: string | null = null;

  try {
    created = await insertCourse(apiCourse);
  } catch (insertErr: any) {
    logSupabaseError("insertCourse threw (non-blocking)", insertErr);
    courseInsertError = insertErr?.message ?? "Unknown course insert error";

    // Last-ditch: try select by api_id in case the course was partially created
    if (apiCourse.id) {
      try {
        created = await getExistingCourseByApiId(apiCourse.id);
        if (created) {
          console.log("[importCourse] recovered course from api_id after insert failure:", created.id);
        }
      } catch { /* ignore */ }
    }
  }

  if (!created) {
    console.error("[importCourse] course insert completely failed — returning empty result for manual tee entry.", {
      courseInsertError,
      courseName: apiCourse.name,
      apiId: apiCourse.id,
    });
    return {
      courseId: "",
      courseName: apiCourse.name ?? "",
      tees: [],
      imported: false,
    };
  }

  const mergedTees: ApiTee[] = Array.isArray(apiCourse.tees)
    ? apiCourse.tees
    : [
        ...((apiCourse.tees?.male as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "M" as const })),
        ...((apiCourse.tees?.female as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "F" as const })),
      ];

  try {
    await importTeesAndHoles(created.id, mergedTees);
  } catch (teeErr: any) {
    logSupabaseError("importTeesAndHoles failed, continuing with 0 tees", teeErr);
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
      logSupabaseError("upsertTeesFromApi failed", upsertErr);
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
