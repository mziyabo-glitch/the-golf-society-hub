/**
 * Read-only report over UK Golf API staging tables.
 * Env: NEXT_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Does not touch courses / course_tees / course_holes.
 */
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config();

type CourseRow = {
  id: string;
  provider_course_id: string;
  matched_club_name: string | null;
  matched_course_name: string | null;
  query: string | null;
  validation_status: string;
  verified_for_play: boolean;
  review_status: string;
  review_notes: string | null;
};

type TeeRow = {
  id: string;
  course_candidate_id: string;
  provider_tee_set_id: string | null;
  tee_set: string | null;
  validation_status: string;
  verified_for_play: boolean;
  review_status: string;
  review_notes: string | null;
  course_rating: number | null;
  slope_rating: number | null;
  par_total: number | null;
  total_yardage: number | null;
  validation_summary: Record<string, unknown> | null;
};

function requireSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function countExact(
  supabase: SupabaseClient,
  table: string,
  filter?: (q: any) => any,
): Promise<number> {
  let q: any = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

async function fetchAllRows<T>(supabase: SupabaseClient, table: string, select: string): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const out: T[] = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} select: ${error.message}`);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function normalizeSampleKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Staging does not persist dry-run trust score; approximate "high" from staged fields. */
function isHighTrustCourse(course: CourseRow, courseTees: TeeRow[], holeCountByTeeId: Map<string, number>): boolean {
  if (course.validation_status !== "verified_candidate" || !course.verified_for_play) return false;
  if (courseTees.length === 0) return false;
  for (const tee of courseTees) {
    if (tee.validation_status !== "verified_candidate" || !tee.verified_for_play) return false;
    if (tee.review_notes) return false;
    const holes = holeCountByTeeId.get(tee.id) ?? 0;
    if (holes !== 18) return false;
    if (tee.course_rating == null || tee.slope_rating == null) return false;
  }
  return true;
}

async function fetchCourseSample(
  supabase: SupabaseClient,
  needles: string[],
): Promise<{
  courses: CourseRow[];
  tees: TeeRow[];
  holesSample: Array<{ tee_candidate_id: string; hole_number: number; par: number | null; yardage: number | null; stroke_index: number | null }>;
} | null> {
  const n = needles.map(normalizeSampleKey).filter(Boolean);
  const orParts = n.flatMap((needle) => {
    const p = `%${needle}%`;
    return [
      `matched_course_name.ilike.${p}`,
      `matched_club_name.ilike.${p}`,
      `query.ilike.${p}`,
    ];
  });
  const { data: courses, error } = await supabase
    .from("uk_golf_api_course_candidates")
    .select(
      "id, provider_course_id, matched_club_name, matched_course_name, query, validation_status, verified_for_play, review_status, review_notes",
    )
    .or(orParts.join(","));
  if (error) throw new Error(error.message);

  const matched = (courses ?? []) as CourseRow[];
  if (matched.length === 0) return null;

  const ids = matched.map((c) => c.id);
  const { data: tees, error: teeErr } = await supabase
    .from("uk_golf_api_tee_candidates")
    .select(
      "id, course_candidate_id, provider_tee_set_id, tee_set, validation_status, verified_for_play, review_status, review_notes, course_rating, slope_rating, par_total, total_yardage, validation_summary",
    )
    .in("course_candidate_id", ids);
  if (teeErr) throw new Error(teeErr.message);
  const teeRows = (tees ?? []) as TeeRow[];

  const teeIds = teeRows.map((t) => t.id);
  let holesSample: Array<{
    tee_candidate_id: string;
    hole_number: number;
    par: number | null;
    yardage: number | null;
    stroke_index: number | null;
  }> = [];
  const holeBatch = 200;
  for (let i = 0; i < teeIds.length; i += holeBatch) {
    const slice = teeIds.slice(i, i + holeBatch);
    if (slice.length === 0) continue;
    const { data: holes, error: holeErr } = await supabase
      .from("uk_golf_api_hole_candidates")
      .select("tee_candidate_id, hole_number, par, yardage, stroke_index")
      .in("tee_candidate_id", slice)
      .lte("hole_number", 3)
      .order("hole_number", { ascending: true });
    if (holeErr) throw new Error(holeErr.message);
    holesSample.push(...((holes ?? []) as typeof holesSample));
  }

  return { courses: matched, tees: teeRows, holesSample };
}

async function main(): Promise<void> {
  const supabase = requireSupabase();

  const [
    stagedCoursesCount,
    stagedTeeCandidatesCount,
    stagedHoleRowsCount,
    verifiedForPlayCoursesCount,
    verifiedForPlayTeesCount,
    pendingReviewCoursesCount,
    pendingReviewTeesCount,
    rejectedReviewCoursesCount,
    rejectedReviewTeesCount,
    partialValidationCoursesCount,
    partialValidationTeesCount,
  ] = await Promise.all([
    countExact(supabase, "uk_golf_api_course_candidates"),
    countExact(supabase, "uk_golf_api_tee_candidates"),
    countExact(supabase, "uk_golf_api_hole_candidates"),
    countExact(supabase, "uk_golf_api_course_candidates", (q) => q.eq("verified_for_play", true)),
    countExact(supabase, "uk_golf_api_tee_candidates", (q) => q.eq("verified_for_play", true)),
    countExact(supabase, "uk_golf_api_course_candidates", (q) => q.eq("review_status", "pending")),
    countExact(supabase, "uk_golf_api_tee_candidates", (q) => q.eq("review_status", "pending")),
    countExact(supabase, "uk_golf_api_course_candidates", (q) => q.eq("review_status", "rejected")),
    countExact(supabase, "uk_golf_api_tee_candidates", (q) => q.eq("review_status", "rejected")),
    countExact(supabase, "uk_golf_api_course_candidates", (q) => q.eq("validation_status", "partial")),
    countExact(supabase, "uk_golf_api_tee_candidates", (q) => q.eq("validation_status", "partial")),
  ]);

  const courses = await fetchAllRows<CourseRow>(
    supabase,
    "uk_golf_api_course_candidates",
    "id, provider_course_id, matched_club_name, matched_course_name, query, validation_status, verified_for_play, review_status, review_notes",
  );
  const tees = await fetchAllRows<TeeRow>(
    supabase,
    "uk_golf_api_tee_candidates",
    "id, course_candidate_id, provider_tee_set_id, tee_set, validation_status, verified_for_play, review_status, review_notes, course_rating, slope_rating, par_total, total_yardage, validation_summary",
  );

  const teesByCourse = new Map<string, TeeRow[]>();
  for (const tee of tees) {
    const list = teesByCourse.get(tee.course_candidate_id) ?? [];
    list.push(tee);
    teesByCourse.set(tee.course_candidate_id, list);
  }

  const holeCountByTeeId = new Map<string, number>();
  const teeIds = tees.map((t) => t.id);
  const pageSize = 500;
  for (let i = 0; i < teeIds.length; i += pageSize) {
    const slice = teeIds.slice(i, i + pageSize);
    if (slice.length === 0) continue;
    const { data: holeRows, error } = await supabase
      .from("uk_golf_api_hole_candidates")
      .select("tee_candidate_id")
      .in("tee_candidate_id", slice);
    if (error) throw new Error(error.message);
    for (const row of holeRows ?? []) {
      const id = (row as { tee_candidate_id: string }).tee_candidate_id;
      holeCountByTeeId.set(id, (holeCountByTeeId.get(id) ?? 0) + 1);
    }
  }

  const highTrustCourses: Array<{
    id: string;
    matched_course_name: string | null;
    matched_club_name: string | null;
    provider_course_id: string;
    teeCount: number;
  }> = [];
  for (const course of courses) {
    const cTees = teesByCourse.get(course.id) ?? [];
    if (isHighTrustCourse(course, cTees, holeCountByTeeId)) {
      highTrustCourses.push({
        id: course.id,
        matched_course_name: course.matched_course_name,
        matched_club_name: course.matched_club_name,
        provider_course_id: course.provider_course_id,
        teeCount: cTees.length,
      });
    }
  }

  const dupKeyCounts = new Map<string, number>();
  for (const tee of tees) {
    if (tee.provider_tee_set_id == null || tee.provider_tee_set_id === "") continue;
    const key = `${tee.course_candidate_id}\t${tee.provider_tee_set_id}`;
    dupKeyCounts.set(key, (dupKeyCounts.get(key) ?? 0) + 1);
  }
  const duplicateProviderTeeSetWithinCourse = [...dupKeyCounts.entries()]
    .filter(([, c]) => c > 1)
    .map(([key, count]) => {
      const tab = key.indexOf("\t");
      const course_candidate_id = tab >= 0 ? key.slice(0, tab) : key;
      const provider_tee_set_id = tab >= 0 ? key.slice(tab + 1) : "";
      return { course_candidate_id, provider_tee_set_id, rowCount: count };
    });

  const nullProviderTeeSetIdTeeCount = tees.filter((t) => t.provider_tee_set_id == null || t.provider_tee_set_id === "").length;

  const coursesWithWarnings: Array<{
    courseId: string;
    matched_course_name: string | null;
    matched_club_name: string | null;
    warnings: Array<{ scope: "course" | "tee"; tee_set?: string | null; notes: string | null }>;
  }> = [];

  for (const course of courses) {
    const warnings: Array<{ scope: "course" | "tee"; tee_set?: string | null; notes: string | null }> = [];
    if (course.review_notes) warnings.push({ scope: "course", notes: course.review_notes });
    const cTees = teesByCourse.get(course.id) ?? [];
    for (const tee of cTees) {
      if (tee.review_notes) warnings.push({ scope: "tee", tee_set: tee.tee_set, notes: tee.review_notes });
    }
    if (warnings.length > 0) {
      coursesWithWarnings.push({
        courseId: course.id,
        matched_course_name: course.matched_course_name,
        matched_club_name: course.matched_club_name,
        warnings,
      });
    }
  }

  const [sampleUpavon, sampleVale, sampleWoodhall] = await Promise.all([
    fetchCourseSample(supabase, ["upavon"]),
    fetchCourseSample(supabase, ["vale resort"]),
    fetchCourseSample(supabase, ["woodhall spa", "woodhall"]),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      stagedCoursesCount,
      stagedTeeCandidatesCount,
      stagedHoleRowsCount,
      verifiedForPlay: {
        courses: verifiedForPlayCoursesCount,
        tees: verifiedForPlayTeesCount,
      },
      highTrustCourses: {
        count: highTrustCourses.length,
        courses: highTrustCourses,
      },
      pendingReview: {
        courses: pendingReviewCoursesCount,
        tees: pendingReviewTeesCount,
      },
      rejectedReview: {
        courses: rejectedReviewCoursesCount,
        tees: rejectedReviewTeesCount,
      },
      partialValidation: {
        courses: partialValidationCoursesCount,
        tees: partialValidationTeesCount,
      },
      duplicateProviderTeeSetId: {
        withinCourseDuplicateGroups: duplicateProviderTeeSetWithinCourse,
        nullProviderTeeSetIdTeeCount,
      },
      coursesWithWarnings: {
        count: coursesWithWarnings.length,
        courses: coursesWithWarnings,
      },
    },
    samples: {
      upavon: sampleUpavon,
      valeResort: sampleVale,
      woodhallSpa: sampleWoodhall,
    },
  };

  console.log("=== UK Golf API staging report (read-only) ===\n");
  console.log(`Staged courses:              ${stagedCoursesCount}`);
  console.log(`Staged tee candidates:       ${stagedTeeCandidatesCount}`);
  console.log(`Staged hole rows:            ${stagedHoleRowsCount}`);
  console.log(`verified_for_play (courses): ${verifiedForPlayCoursesCount}`);
  console.log(`verified_for_play (tees):    ${verifiedForPlayTeesCount}`);
  console.log(`High-trust courses:          ${highTrustCourses.length} (verified_candidate + all tees verified + 18 holes + rating/slope + no review_notes)`);
  console.log(`Pending review (courses):    ${pendingReviewCoursesCount}`);
  console.log(`Pending review (tees):       ${pendingReviewTeesCount}`);
  console.log(`Rejected review (courses):   ${rejectedReviewCoursesCount}`);
  console.log(`Rejected review (tees):      ${rejectedReviewTeesCount}`);
  console.log(`Partial validation (courses): ${partialValidationCoursesCount}`);
  console.log(`Partial validation (tees):      ${partialValidationTeesCount}`);
  console.log(`Duplicate provider_tee_set_id (same course): ${duplicateProviderTeeSetWithinCourse.length} group(s)`);
  console.log(`NULL provider_tee_set_id (tees):             ${nullProviderTeeSetIdTeeCount}`);
  console.log(`Courses with warnings (review_notes):        ${coursesWithWarnings.length}`);
  console.log("\n--- JSON (full report) ---\n");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
