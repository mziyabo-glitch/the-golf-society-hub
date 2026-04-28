import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runUkGolfApiDryRun } from "./uk-golf-api-dry-run";

dotenv.config();

type CourseCandidateSummaryRow = {
  id: string;
  validation_status: string;
  verified_for_play: boolean;
  review_notes: string | null;
};

type TeeCandidateSummaryRow = {
  id: string;
  course_candidate_id: string;
  validation_status: string;
  verified_for_play: boolean;
  review_notes: string | null;
  course_rating: number | null;
  slope_rating: number | null;
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
  filter?: (query: any) => any,
): Promise<number> {
  let q: any = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function fetchAllRows<T>(supabase: SupabaseClient, table: string, select: string): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const out: T[] = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} select failed: ${error.message}`);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function computeHighTrustCourseCount(supabase: SupabaseClient): Promise<number> {
  const courses = await fetchAllRows<CourseCandidateSummaryRow>(
    supabase,
    "uk_golf_api_course_candidates",
    "id, validation_status, verified_for_play, review_notes",
  );
  const tees = await fetchAllRows<TeeCandidateSummaryRow>(
    supabase,
    "uk_golf_api_tee_candidates",
    "id, course_candidate_id, validation_status, verified_for_play, review_notes, course_rating, slope_rating",
  );

  const teesByCourse = new Map<string, TeeCandidateSummaryRow[]>();
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
    const { data, error } = await supabase
      .from("uk_golf_api_hole_candidates")
      .select("tee_candidate_id")
      .in("tee_candidate_id", slice);
    if (error) throw new Error(`uk_golf_api_hole_candidates select failed: ${error.message}`);
    for (const row of data ?? []) {
      const teeId = String((row as { tee_candidate_id: string }).tee_candidate_id);
      holeCountByTeeId.set(teeId, (holeCountByTeeId.get(teeId) ?? 0) + 1);
    }
  }

  let highTrustCount = 0;
  for (const course of courses) {
    if (course.validation_status !== "verified_candidate" || !course.verified_for_play || course.review_notes) continue;
    const courseTees = teesByCourse.get(course.id) ?? [];
    if (courseTees.length === 0) continue;

    const allTeesReady = courseTees.every((tee) => {
      if (tee.validation_status !== "verified_candidate") return false;
      if (!tee.verified_for_play) return false;
      if (tee.review_notes) return false;
      if (tee.course_rating == null || tee.slope_rating == null) return false;
      return (holeCountByTeeId.get(tee.id) ?? 0) === 18;
    });
    if (allTeesReady) highTrustCount += 1;
  }

  return highTrustCount;
}

async function logStagingSummary(fallbackDiscoveryCalls: number): Promise<void> {
  const supabase = requireSupabase();
  const [
    stagedCoursesCount,
    stagedTeesCount,
    verifiedForPlayCount,
    partialCount,
    rejectedCount,
    highTrustCoursesCount,
  ] = await Promise.all([
    countExact(supabase, "uk_golf_api_course_candidates"),
    countExact(supabase, "uk_golf_api_tee_candidates"),
    countExact(supabase, "uk_golf_api_course_candidates", (q) => q.eq("verified_for_play", true)),
    countExact(supabase, "uk_golf_api_course_candidates", (q) => q.eq("validation_status", "partial")),
    countExact(supabase, "uk_golf_api_course_candidates", (q) => q.eq("validation_status", "unverified")),
    computeHighTrustCourseCount(supabase),
  ]);

  console.log("[course-import:summary]", {
    stagedCoursesCount,
    stagedTeesCount,
    verifiedForPlayCount,
    highTrustCoursesCount,
    fallbackDiscoveryCalls,
    partialCount,
    rejectedCount,
  });
}

async function main(): Promise<void> {
  if (process.env.UK_GOLF_API_ALLOW_LIVE_PROMOTION === "true") {
    console.warn(
      "[course-import-nightly] UK_GOLF_API_ALLOW_LIVE_PROMOTION=true detected; nightly-course-import is staging-only and will not promote.",
    );
  }

  const { fallbackDiscoveryCalls } = await runUkGolfApiDryRun();
  await logStagingSummary(fallbackDiscoveryCalls);
}

main().catch((error) => {
  console.error("[course-import-nightly] fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
