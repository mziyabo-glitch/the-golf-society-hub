import { supabase } from "@/lib/supabase";
import type { ApiCourse, ApiTee } from "@/lib/golfApi";

export type ImportedTee = {
  id: string;
  teeName: string;
  courseRating: number | null;
  slopeRating: number | null;
  parTotal: number | null;
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

function normalizeTee(tee: ApiTee): {
  teeName: string;
  courseRating: number | null;
  slopeRating: number | null;
  parTotal: number | null;
} | null {
  const teeName = (tee.tee_name || tee.name || "").trim();
  if (!teeName) return null;

  return {
    teeName,
    courseRating: tee.course_rating != null ? Number(tee.course_rating) : null,
    slopeRating: tee.slope_rating != null ? Number(tee.slope_rating) : null,
    parTotal: tee.par_total != null ? Number(tee.par_total) : null,
  };
}

async function getExistingCourseByApiId(apiId: number) {
  const { data, error } = await supabase
    .from("courses")
    .select("id, name")
    .eq("api_id", apiId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getImportedTees(courseId: string): Promise<ImportedTee[]> {
  const { data, error } = await supabase
    .from("course_tees")
    .select("id, tee_name, course_rating, slope_rating, par_total")
    .eq("course_id", courseId)
    .order("tee_name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    teeName: row.tee_name,
    courseRating: row.course_rating ?? null,
    slopeRating: row.slope_rating ?? null,
    parTotal: row.par_total ?? null,
  }));
}

async function insertCourse(course: ApiCourse): Promise<{ id: string; name: string }> {
  const payload = {
    name: course.name,
    club_name: course.club_name ?? null,
    lat: getLat(course),
    lng: getLng(course),
    api_id: course.id,
  };

  const { data, error } = await supabase
    .from("courses")
    .insert(payload)
    .select("id, name")
    .single();

  if (!error) return data;

  // Duplicate race condition safety (unique api_id)
  if ((error as any).code === "23505") {
    const existing = await getExistingCourseByApiId(course.id);
    if (existing) return existing;
  }

  throw error;
}

async function importTeesAndHoles(courseId: string, tees: ApiTee[] | undefined): Promise<void> {
  if (!Array.isArray(tees) || tees.length === 0) return;

  for (const tee of tees) {
    const normalized = normalizeTee(tee);
    if (!normalized) continue;

    const { data: teeRow, error: teeError } = await supabase
      .from("course_tees")
      .insert({
        course_id: courseId,
        tee_name: normalized.teeName,
        course_rating: normalized.courseRating,
        slope_rating: normalized.slopeRating,
        par_total: normalized.parTotal,
      })
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
      throw holesError;
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
    console.log("[importCourse] course already exists", existing.id);
    const tees = await getImportedTees(existing.id);
    return {
      courseId: existing.id,
      courseName: existing.name,
      tees,
      imported: false,
    };
  }

  const created = await insertCourse(apiCourse);

  const mergedTees = Array.isArray(apiCourse.tees)
    ? apiCourse.tees
    : [
        ...((apiCourse.tees?.male as ApiTee[] | undefined) || []),
        ...((apiCourse.tees?.female as ApiTee[] | undefined) || []),
      ];

  await importTeesAndHoles(created.id, mergedTees);
  const tees = await getImportedTees(created.id);

  console.log("[importCourse] import completed", {
    courseId: created.id,
    tees: tees.length,
  });

  return {
    courseId: created.id,
    courseName: created.name,
    tees,
    imported: true,
  };
}
