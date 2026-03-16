import { supabase } from "@/lib/supabase";
import { getSupabaseServer } from "@/lib/supabase-server";
import { upsertTeesFromApi, getCanonicalCourseByNormalizedName } from "@/lib/db_supabase/courseRepo";
import { isValidUuid } from "@/lib/uuid";

function getClient() {
  return getSupabaseServer() ?? supabase;
}
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
  const selectStr = "*";
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const params = new URLSearchParams();
  params.set("select", selectStr);
  params.set("api_id", `eq.${apiId}`);
  const path = `/rest/v1/courses?${params.toString()}`;
  const fullUrl = base ? `${base.replace(/\/$/, "")}${path}` : path;
  console.log("[importCourse] getExistingCourseByApiId FULL QUERY:", {
    select: selectStr,
    filters: { api_id: apiId },
    builtPath: path,
    fullUrl,
  });
  try {
    const { data, error } = await getClient()
      .from("courses")
      .select(selectStr)
      .eq("api_id", apiId)
      .maybeSingle();

    if (error) {
      console.error("[importCourse] getExistingCourseByApiId FAILED:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    return data;
  } catch (err) {
    const e = err as { message?: string; code?: string; details?: unknown; hint?: string };
    console.error("[importCourse] getExistingCourseByApiId exception:", {
      message: e?.message,
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
    });
    throw err;
  }
}

async function getImportedTees(courseId: string): Promise<ImportedTee[]> {
  if (!isValidUuid(courseId)) {
    console.warn("[importCourse] Skipping tee lookup: invalid courseId");
    return [];
  }
  const { data, error } = await getClient()
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

/**
 * Normalize name for DB normalized_name column (NOT NULL).
 * - lowercase, trim, collapse whitespace, remove punctuation
 * - always returns non-empty string
 */
function normalizeName(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return "unknown";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "unknown";
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
  const name = (course.name ?? "").trim();
  const combined = [club, name].filter(Boolean).join("-") || "unknown";
  return slugify(combined);
}

/**
 * Build courses insert payload: only valid DB columns, no undefined, schema-safe.
 * Includes dedupe_key and raw_row (NOT NULL required by schema).
 * raw_row: original API response object (jsonb) or JSON string (text). Never null.
 */
function buildCoursePayload(course: ApiCourse): Record<string, unknown> {
  const apiId = safeApiId(course.id);
  const courseName = safeCourseName(course.name);
  const clubName = course.club_name != null ? String(course.club_name).trim() || null : null;
  const lat = safeDouble(getLat(course));
  const lng = safeDouble(getLng(course));
  const dedupeKey = buildDedupeKey(course, apiId);
  const normalizedName = normalizeName(courseName);

  // raw_row: NOT NULL. Use raw API object; fallback to minimal object if missing.
  const rawRow = course.raw_row != null && typeof course.raw_row === "object"
    ? course.raw_row
    : course.raw_row != null
      ? { value: course.raw_row }
      : { source: "golfcourseapi", api_id: apiId, course_name: courseName };

  const payload: Record<string, unknown> = {
    course_name: courseName,
    club_name: clubName,
    lat,
    lng,
    api_id: apiId,
    dedupe_key: dedupeKey.trim() || "unknown",
    normalized_name: normalizedName,
    raw_row: rawRow,
  };

  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined) cleaned[k] = v;
  }
  return cleaned;
}

async function insertCourse(course: ApiCourse): Promise<{ id: string; course_name: string }> {
  const payload = buildCoursePayload(course);

  if (payload.dedupe_key == null || String(payload.dedupe_key).trim() === "") {
    throw new Error("dedupe_key is required for courses insert");
  }

  console.log("[importCourse] insertCourse FINAL payload:\n" + JSON.stringify(payload, null, 2));

  let data: { id: string; course_name: string } | null = null;
  let error: any = null;

  const selectStr = "id,course_name";
  console.log("[importCourse] courses upsert:", { select: selectStr, onConflict: "dedupe_key" });
  const result = await getClient()
    .from("courses")
    .upsert(payload, { onConflict: "dedupe_key" })
    .select(selectStr)
    .single();
  data = result.data;
  error = result.error;

  if (!error && data) {
    console.log("[importCourse] insertCourse SUCCESS: course found/inserted", {
      id: data.id,
      isValidUuid: isValidUuid(data.id),
      course_name: data.course_name,
      teeImportProceeds: isValidUuid(data.id),
    });
    return data;
  }

  if (error) {
    const err = error as any;
    const errLog = {
      code: err.code,
      message: err.message,
      details: err.details,
      hint: err.hint,
      full: JSON.stringify(err, null, 2),
    };
    console.error("[importCourse] insertCourse FAILED:\n" + JSON.stringify(errLog, null, 2));
    console.error("[importCourse] payload that was sent:\n" + JSON.stringify(payload, null, 2));

    if (err.code === "23505") {
      const existing = await getExistingCourseByApiId(course.id);
      if (existing) return existing;
    }

    if (err.code === "42P10" || err.message?.includes("ON CONFLICT") || err.message?.includes("conflict")) {
      console.warn("[importCourse] upsert failed, falling back to insert");
      console.log("[importCourse] courses insert:", { select: "id,course_name" });
      const insertResult = await getClient()
        .from("courses")
        .insert(payload)
        .select("id,course_name")
        .single();
      if (!insertResult.error) return insertResult.data;
      const insErr = insertResult.error as any;
      console.error("[importCourse] insert fallback FAILED:\n" + JSON.stringify({
        code: insErr.code,
        message: insErr.message,
        details: insErr.details,
        hint: insErr.hint,
      }, null, 2));
      if (insErr.code === "23505") {
        const existing = await getExistingCourseByApiId(course.id);
        if (existing) return existing;
      }
      throw new Error(
        `Course import failed. You can still save the event with manual tee details. ` +
          (insErr?.message ?? "Unknown error")
      );
    }

    throw new Error(
      `Course import failed: ${err.message}. You can still save the event with manual tee details.`
    );
  }

  throw new Error("insertCourse: no data returned");
}

/**
 * Idempotent tee + hole import. Uses upsert for tees (course_id, tee_name) and
 * inserts only missing holes. Never throws on duplicates; reuses existing rows.
 */
async function importTeesAndHoles(
  courseId: string,
  tees: ApiTee[] | undefined,
  gender?: "M" | "F"
): Promise<{ teesInserted: number; teesSkipped: number; holesInserted: number; holesSkipped: number }> {
  const stats = { teesInserted: 0, teesSkipped: 0, holesInserted: 0, holesSkipped: 0 };

  if (!isValidUuid(courseId)) {
    console.warn("[importCourse] Skipping tee import: invalid courseId (no valid local course UUID)");
    return stats;
  }
  if (!Array.isArray(tees) || tees.length === 0) return stats;

  // 1. Fetch existing tees for course (idempotent: know what's already there)
  const { data: existingTees, error: fetchErr } = await getClient()
    .from("course_tees")
    .select("id, tee_name, is_manual_override")
    .eq("course_id", courseId);
  if (fetchErr) {
    console.error("[importCourse] Failed to fetch existing tees:", fetchErr.message);
    return stats;
  }
  const existingByTeeName = new Map<string, string>((existingTees ?? []).map((t: any) => [t.tee_name, t.id]));
  const manualOverrideNames = new Set(
    (existingTees ?? []).filter((t: any) => t.is_manual_override === true).map((t: any) => (t.tee_name || "").toLowerCase())
  );
  console.log("[importCourse] Existing tees for course:", existingByTeeName.size, Array.from(existingByTeeName.keys()));

  for (const tee of tees) {
    const normalized = normalizeTee(tee, gender);
    if (!normalized) continue;

    if (manualOverrideNames.has(normalized.teeName.toLowerCase())) {
      stats.teesSkipped++;
      console.log("[importCourse] Skipping tee (manual override):", normalized.teeName);
      continue;
    }

    const cr = normalized.courseRating;
    const sr = normalized.slopeRating;
    const pt = normalized.parTotal;
    const teePayload = {
      course_id: courseId,
      tee_name: normalized.teeName,
      course_rating: cr != null && Number.isFinite(cr) ? cr : null,
      slope_rating: sr != null && Number.isFinite(sr) ? Math.round(sr) : null,
      par_total: pt != null && Number.isFinite(pt) ? Math.round(pt) : null,
      gender: normalized.gender ?? null,
      yards: normalized.yards != null && Number.isFinite(normalized.yards) ? Math.round(normalized.yards) : null,
      source: "imported",
    };

    let teeId: string | null = existingByTeeName.get(normalized.teeName) ?? null;

    if (!teeId) {
      // Upsert: insert or update on (course_id, tee_name). Conflict target matches UNIQUE(course_id, tee_name).
      const { data: upserted, error: teeError } = await getClient()
        .from("course_tees")
        .upsert(teePayload, { onConflict: "course_id,tee_name" })
        .select("id")
        .single();

      if (teeError) {
        const te = teeError as any;
        if (te.code === "23505" || te.message?.includes("duplicate") || te.message?.includes("unique")) {
          const { data: existing } = await getClient()
            .from("course_tees")
            .select("id")
            .eq("course_id", courseId)
            .eq("tee_name", normalized.teeName)
            .maybeSingle();
          teeId = existing?.id ?? null;
          stats.teesSkipped++;
          console.log("[importCourse] Tee already exists, reusing:", normalized.teeName);
        } else {
          console.error("[importCourse] course_tees upsert failed:", te.code, te.message);
          continue;
        }
      } else {
        teeId = upserted?.id ?? null;
        stats.teesInserted++;
        if (teeId) existingByTeeName.set(normalized.teeName, teeId);
        console.log("[importCourse] Tee inserted:", normalized.teeName);
      }
    } else {
      stats.teesSkipped++;
      console.log("[importCourse] Tee already in DB, reusing:", normalized.teeName);
    }

    if (!teeId) continue;

    if (!Array.isArray(tee.holes) || tee.holes.length === 0) {
      console.log("[importCourse] tee has no hole data:", normalized.teeName);
      continue;
    }

    // 2. Fetch existing holes for this tee
    const { data: existingHoles } = await getClient()
      .from("course_holes")
      .select("hole_number")
      .eq("tee_id", teeId);
    const existingHoleNums = new Set((existingHoles ?? []).map((h: any) => h.hole_number));

    const holeRows = tee.holes
      .map((hole: any, i: number) => {
        const holeNum = i + 1;
        if (existingHoleNums.has(holeNum)) {
          stats.holesSkipped++;
          return null;
        }
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
      .filter((h): h is NonNullable<typeof h> => h != null && Number.isFinite(h.hole_number));

    if (holeRows.length === 0) continue;

    const { error: holesError } = await getClient()
      .from("course_holes")
      .upsert(holeRows, { onConflict: "tee_id,hole_number" });

    if (holesError) {
      const he = holesError as any;
      if (he.code === "23505" || he.message?.includes("duplicate") || he.message?.includes("unique")) {
        stats.holesSkipped += holeRows.length;
        console.log("[importCourse] Holes already exist for tee, skipped:", normalized.teeName);
      } else {
        console.error("[importCourse] course_holes upsert failed:", he.code, he.message);
        for (const row of holeRows) {
          const { error: singleErr } = await getClient().from("course_holes").insert(row);
          if (!singleErr) stats.holesInserted++;
          else if ((singleErr as any).code === "23505") stats.holesSkipped++;
        }
      }
    } else {
      stats.holesInserted += holeRows.length;
      console.log("[importCourse] Holes inserted:", holeRows.length, "for tee", normalized.teeName);
    }
  }

  console.log("[importCourse] importTeesAndHoles stats:", stats);
  return stats;
}

/** Extract API tees as ImportedTee[] with synthetic ids for UI when DB persist fails */
function apiTeesToImported(apiCourse: ApiCourse): ImportedTee[] {
  const merged: ApiTee[] = Array.isArray(apiCourse.tees)
    ? apiCourse.tees
    : [
        ...((apiCourse.tees?.male as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "M" as const })),
        ...((apiCourse.tees?.female as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "F" as const })),
      ];
  const result: ImportedTee[] = [];
  merged.forEach((t, i) => {
    const n = normalizeTee(t);
    if (n) {
      result.push({
        id: `api-${(t as any).id ?? i}`,
        teeName: n.teeName,
        courseRating: n.courseRating,
        slopeRating: n.slopeRating,
        parTotal: n.parTotal,
        gender: n.gender,
        yards: n.yards,
      });
    }
  });
  return result;
}

export async function importCourse(apiCourse: ApiCourse): Promise<ImportedCourse> {
  if (!apiCourse?.id) throw new Error("Invalid GolfCourseAPI course payload.");

  const mergedTees: ApiTee[] = Array.isArray(apiCourse.tees)
    ? apiCourse.tees
    : [
        ...((apiCourse.tees?.male as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "M" as const })),
        ...((apiCourse.tees?.female as ApiTee[] | undefined) || []).map((t) => ({ ...t, gender: "F" as const })),
      ];

  const existing = await getExistingCourseByApiId(apiCourse.id);
  if (existing) {
    const tees = await getImportedTees(existing.id);
    if (tees.length > 0) {
      console.log("[importCourse] course already exists with tees", existing.id, tees.length);
      console.log("[importCourse] FINAL RESULT:", {
        courseInsertSucceeded: true,
        localCourseUuid: existing.id,
        teeImportProceeded: false,
        reused: true,
        teesFromDb: tees.length,
      });
      return {
        courseId: existing.id,
        courseName: existing.course_name ?? "",
        tees,
        imported: false,
      };
    }
    if (!isValidUuid(existing.id)) {
      console.warn("[importCourse] existing course id invalid, skipping tee DB writes");
      const apiTees = apiTeesToImported(apiCourse);
      console.log("[importCourse] FINAL RESULT:", {
        courseInsertSucceeded: true,
        localCourseUuid: null,
        teeImportProceeded: false,
        fallback: "API tees for manual selection",
      });
      return { courseId: "", courseName: existing.course_name ?? apiCourse.name ?? "", tees: apiTees, imported: false };
    }
    console.log("[importCourse] course exists but 0 tees, re-importing tees from API");
    const canonical = await getCanonicalCourseByNormalizedName(
      existing.course_name ?? apiCourse.name ?? "",
      existing.id
    );
    const courseIdForTees = canonical?.id ?? existing.id;
    if (canonical) {
      console.log("[importCourse] Using canonical course for tees:", canonical.id, canonical.course_name);
    }
    const teeStats = await importTeesAndHoles(courseIdForTees, mergedTees);
    console.log("[importCourse] tee import stats:", teeStats);
    let teesAfter = await getImportedTees(courseIdForTees);
    if (teesAfter.length === 0 && mergedTees.length > 0) {
      const list = await upsertTeesFromApi(courseIdForTees, apiCourse.tees as any);
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
    if (teesAfter.length === 0) {
      const apiTees = apiTeesToImported(apiCourse);
      console.log("[importCourse] FINAL RESULT:", {
        courseInsertSucceeded: true,
        localCourseUuid: courseIdForTees,
        teeImportProceeded: true,
        reused: true,
        teesFromDb: 0,
        teesFromApi: apiTees.length,
      });
      return { courseId: courseIdForTees, courseName: existing.course_name ?? "", tees: apiTees, imported: false };
    }
    console.log("[importCourse] FINAL RESULT:", {
      courseInsertSucceeded: true,
      localCourseUuid: courseIdForTees,
      teeImportProceeded: true,
      reused: true,
      teesFromDb: teesAfter.length,
    });
    return { courseId: courseIdForTees, courseName: existing.course_name ?? "", tees: teesAfter, imported: false };
  }

  const canonicalBeforeInsert = await getCanonicalCourseByNormalizedName(apiCourse.name ?? "");
  if (canonicalBeforeInsert) {
    console.log("[importCourse] Reusing canonical course instead of creating duplicate:", canonicalBeforeInsert.id, canonicalBeforeInsert.course_name);
    const teeStats = await importTeesAndHoles(canonicalBeforeInsert.id, mergedTees);
    let teesAfter = await getImportedTees(canonicalBeforeInsert.id);
    if (teesAfter.length === 0 && mergedTees.length > 0) {
      const list = await upsertTeesFromApi(canonicalBeforeInsert.id, apiCourse.tees as any);
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
    if (teesAfter.length === 0) {
      return {
        courseId: canonicalBeforeInsert.id,
        courseName: canonicalBeforeInsert.course_name,
        tees: apiTeesToImported(apiCourse),
        imported: false,
      };
    }
    return {
      courseId: canonicalBeforeInsert.id,
      courseName: canonicalBeforeInsert.course_name,
      tees: teesAfter,
      imported: false,
    };
  }

  let created: { id: string; course_name: string };
  try {
    created = await insertCourse(apiCourse);
  } catch (insertErr: any) {
    console.error("[importCourse] insertCourse threw, returning API tees as fallback:", insertErr?.message);
    const apiTees = apiTeesToImported(apiCourse);
    console.log("[importCourse] FINAL RESULT:", {
      courseInsertSucceeded: false,
      localCourseUuid: null,
      teeImportProceeded: false,
      fallback: "manual tee entry + event save still available",
    });
    return {
      courseId: "",
      courseName: apiCourse.name ?? "",
      tees: apiTees,
      imported: false,
    };
  }

  if (!isValidUuid(created.id)) {
    console.warn("[importCourse] created course id invalid, skipping tee DB writes, returning API tees");
    const apiTees = apiTeesToImported(apiCourse);
    console.log("[importCourse] FINAL RESULT:", {
      courseInsertSucceeded: true,
      localCourseUuid: null,
      teeImportProceeded: false,
      fallback: "API tees for manual selection",
    });
    return { courseId: "", courseName: created.course_name ?? "", tees: apiTees, imported: true };
  }

  try {
    const teeStats = await importTeesAndHoles(created.id, mergedTees);
    console.log("[importCourse] tee import stats:", teeStats);
    if (teeStats.teesInserted > 0 || teeStats.holesInserted > 0) {
      await getClient()
        .from("courses")
        .update({
          enrichment_status: teeStats.holesInserted > 0 ? "holes_loaded" : "tees_loaded",
          enrichment_updated_at: new Date().toISOString(),
        })
        .eq("id", created.id);
    }
  } catch (teeErr: any) {
    console.error("[importCourse] importTeesAndHoles failed (non-fatal):", teeErr?.message);
  }

  let tees = await getImportedTees(created.id);

  if (tees.length === 0 && mergedTees.length > 0) {
    try {
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

  if (tees.length === 0 && mergedTees.length > 0) {
    const apiTees = apiTeesToImported(apiCourse);
    console.log("[importCourse] FINAL RESULT:", {
      courseInsertSucceeded: true,
      localCourseUuid: created.id,
      teeImportProceeded: true,
      teesFromDb: 0,
      teesFromApi: apiTees.length,
    });
    return { courseId: created.id, courseName: created.course_name ?? "", tees: apiTees, imported: true };
  }

  console.log("[importCourse] FINAL RESULT:", {
    courseInsertSucceeded: true,
    localCourseUuid: created.id,
    teeImportProceeded: true,
    teesFromDb: tees.length,
    teesFromApi: 0,
  });
  return { courseId: created.id, courseName: created.course_name ?? "", tees, imported: true };
}
