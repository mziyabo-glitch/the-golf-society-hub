import { supabase } from "@/lib/supabase";

export type UkGolfStagingCourseRow = {
  id: string;
  provider_course_id: string;
  provider_club_id: string | null;
  query: string | null;
  matched_club_name: string | null;
  matched_course_name: string | null;
  validation_status: string;
  verified_for_play: boolean;
  review_status: string;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  imported_at: string;
};

export type UkGolfStagingTeeRow = {
  id: string;
  course_candidate_id: string;
  provider_tee_set_id: string | null;
  tee_set: string | null;
  tee_colour: string | null;
  tee_gender: string | null;
  course_rating: number | null;
  slope_rating: number | null;
  par_total: number | null;
  total_yardage: number | null;
  validation_status: string;
  verified_for_play: boolean;
  review_status: string;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  validation_summary: Record<string, unknown> | null;
  imported_at: string;
};

export type UkGolfStagingCourseWithTees = UkGolfStagingCourseRow & {
  holeCountByTeeId: Record<string, number>;
  tees: UkGolfStagingTeeRow[];
};

export type UkGolfStagingTrustLevel = "high" | "medium" | "low";

export function computeUkGolfStagingTrustLevel(
  course: UkGolfStagingCourseRow,
  tees: UkGolfStagingTeeRow[],
  holeCountByTeeId: Record<string, number>,
): UkGolfStagingTrustLevel {
  if (course.validation_status !== "verified_candidate" || !course.verified_for_play) return "low";
  if (tees.length === 0) return "low";
  let allHigh = true;
  for (const tee of tees) {
    const holes = holeCountByTeeId[tee.id] ?? 0;
    const okTee =
      tee.validation_status === "verified_candidate" &&
      tee.verified_for_play &&
      holes === 18 &&
      tee.course_rating != null &&
      tee.slope_rating != null &&
      !tee.review_notes;
    if (!okTee) allHigh = false;
  }
  if (allHigh) return "high";
  const anyPartial = tees.some((t) => t.validation_status === "partial" || !t.verified_for_play);
  if (anyPartial) return "low";
  return "medium";
}

export function collectUkGolfStagingWarnings(course: UkGolfStagingCourseRow, tees: UkGolfStagingTeeRow[]): string[] {
  const w: string[] = [];
  if (course.review_notes) w.push(`course: ${course.review_notes}`);
  for (const tee of tees) {
    if (tee.review_notes) w.push(`tee ${tee.tee_set ?? "?"}: ${tee.review_notes}`);
  }
  return w;
}

async function fetchHoleCountsByTeeIds(teeIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (teeIds.length === 0) return out;
  const page = 500;
  for (let i = 0; i < teeIds.length; i += page) {
    const slice = teeIds.slice(i, i + page);
    const { data, error } = await supabase
      .from("uk_golf_api_hole_candidates")
      .select("tee_candidate_id")
      .in("tee_candidate_id", slice);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const id = (row as { tee_candidate_id: string }).tee_candidate_id;
      out[id] = (out[id] ?? 0) + 1;
    }
  }
  return out;
}

/**
 * Platform-admin only (RLS + RPC). Lists staged UK Golf candidates with tees and hole counts.
 */
export async function listUkGolfStagingCoursesWithTees(): Promise<UkGolfStagingCourseWithTees[]> {
  const { data: courses, error: cErr } = await supabase
    .from("uk_golf_api_course_candidates")
    .select(
      "id, provider_course_id, provider_club_id, query, matched_club_name, matched_course_name, validation_status, verified_for_play, review_status, review_notes, reviewed_by, reviewed_at, imported_at",
    )
    .order("imported_at", { ascending: false });
  if (cErr) throw new Error(cErr.message);
  const courseRows = (courses ?? []) as UkGolfStagingCourseRow[];
  if (courseRows.length === 0) return [];

  const courseIds = courseRows.map((c) => c.id);
  const { data: tees, error: tErr } = await supabase
    .from("uk_golf_api_tee_candidates")
    .select(
      "id, course_candidate_id, provider_tee_set_id, tee_set, tee_colour, tee_gender, course_rating, slope_rating, par_total, total_yardage, validation_status, verified_for_play, review_status, review_notes, reviewed_by, reviewed_at, validation_summary, imported_at",
    )
    .in("course_candidate_id", courseIds);
  if (tErr) throw new Error(tErr.message);
  const teeRows = (tees ?? []) as UkGolfStagingTeeRow[];

  const teesByCourse = new Map<string, UkGolfStagingTeeRow[]>();
  for (const t of teeRows) {
    const list = teesByCourse.get(t.course_candidate_id) ?? [];
    list.push(t);
    teesByCourse.set(t.course_candidate_id, list);
  }

  const holeCountByTeeId = await fetchHoleCountsByTeeIds(teeRows.map((t) => t.id));

  return courseRows.map((c) => ({
    ...c,
    tees: teesByCourse.get(c.id) ?? [],
    holeCountByTeeId,
  }));
}

export async function reviewUkGolfCourseCandidate(
  courseCandidateId: string,
  reviewStatus: "pending" | "approved" | "rejected",
  reviewNotes?: string | null,
): Promise<UkGolfStagingCourseRow> {
  const { data, error } = await supabase.rpc("review_uk_golf_api_course_candidate", {
    p_course_candidate_id: courseCandidateId,
    p_review_status: reviewStatus,
    p_review_notes: reviewNotes ?? null,
  });
  if (error) throw new Error(error.message);
  const raw = data as UkGolfStagingCourseRow | UkGolfStagingCourseRow[] | null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row?.id) throw new Error("review_uk_golf_api_course_candidate: no row returned");
  return row;
}

export async function reviewUkGolfTeeCandidate(
  teeCandidateId: string,
  reviewStatus: "pending" | "approved" | "rejected",
  reviewNotes?: string | null,
): Promise<UkGolfStagingTeeRow> {
  const { data, error } = await supabase.rpc("review_uk_golf_api_tee_candidate", {
    p_tee_candidate_id: teeCandidateId,
    p_review_status: reviewStatus,
    p_review_notes: reviewNotes ?? null,
  });
  if (error) throw new Error(error.message);
  const raw = data as UkGolfStagingTeeRow | UkGolfStagingTeeRow[] | null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row?.id) throw new Error("review_uk_golf_api_tee_candidate: no row returned");
  return row;
}
