import { supabase } from "@/lib/supabase";
import type { ApiCourse, ApiHole, ApiTee } from "@/lib/golfApi";

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

function normalizeHole(hole: ApiHole, idx: number) {
  const holeNumberRaw = hole.hole_number ?? hole.number ?? idx + 1;
  const holeNumber = Number(holeNumberRaw);
  if (!Number.isFinite(holeNumber) || holeNumber < 1 || holeNumber > 36) return null;

  return {
    hole_number: holeNumber,
    par: hole.par != null ? Number(hole.par) : null,
    yardage: hole.yardage != null ? Number(hole.yardage) : null,
    stroke_index: hole.stroke_index != null
      ? Number(hole.stroke_index)
      : hole.hcp != null
        ? Number(hole.hcp)
        : null,
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
      .upsert(
        {
          course_id: courseId,
          tee_name: normalized.teeName,
          course_rating: normalized.courseRating,
          slope_rating: normalized.slopeRating,
          par_total: normalized.parTotal,
        },
        { onConflict: "course_id,tee_name" }
      )
      .select("id")
      .single();

    if (teeError) throw teeError;
    if (!teeRow?.id) continue;

    if (!Array.isArray(tee.holes) || tee.holes.length === 0) {
      console.log("[importCourse] tee has no hole data:", normalized.teeName);
      continue;
    }

    const holeRows = tee.holes
      .map((hole, idx) => normalizeHole(hole, idx))
      .filter(Boolean)
      .map((hole: any) => ({
        course_id: courseId,
        tee_id: teeRow.id,
        hole_number: hole.hole_number,
        par: hole.par,
        yardage: hole.yardage,
        stroke_index: hole.stroke_index,
      }));

    if (holeRows.length === 0) continue;

    const { error: holesError } = await supabase
      .from("course_holes")
      .upsert(holeRows, { onConflict: "tee_id,hole_number" });

    if (holesError) throw holesError;
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
  await importTeesAndHoles(created.id, apiCourse.tees);
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
