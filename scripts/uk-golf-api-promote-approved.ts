/**
 * Promote approved UK Golf API staging candidates into live courses / course_tees / course_holes.
 *
 * Default: dry-run (no writes).
 * Live writes require: UK_GOLF_API_ALLOW_LIVE_PROMOTION=true
 * Overwrite verified live courses: UK_GOLF_API_ALLOW_VERIFIED_OVERWRITE=true
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config();

type HoleRow = {
  hole_number: number;
  par: number | null;
  yardage: number | null;
  stroke_index: number | null;
};

function requireEnv(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isDryRun(): boolean {
  return (process.env.UK_GOLF_API_ALLOW_LIVE_PROMOTION ?? "").toLowerCase() !== "true";
}

function allowVerifiedOverwrite(): boolean {
  return (process.env.UK_GOLF_API_ALLOW_VERIFIED_OVERWRITE ?? "").toLowerCase() === "true";
}

function validateSi18(holes: HoleRow[]): { ok: boolean; reason?: string } {
  if (holes.length !== 18) return { ok: false, reason: `expected 18 holes, got ${holes.length}` };
  const sis = holes.map((h) => h.stroke_index).filter((x): x is number => x != null && Number.isFinite(x));
  if (sis.length !== 18) return { ok: false, reason: "missing stroke_index on one or more holes" };
  const set = new Set(sis);
  if (set.size !== 18) return { ok: false, reason: "duplicate or missing stroke index values" };
  for (const si of sis) {
    if (si < 1 || si > 18) return { ok: false, reason: `stroke_index out of range: ${si}` };
  }
  return { ok: true };
}

async function fetchApprovedStaging(supabase: SupabaseClient): Promise<{
  courses: Array<Record<string, unknown>>;
  teesByCourse: Map<string, Array<Record<string, unknown>>>;
}> {
  const { data: courses, error: cErr } = await supabase
    .from("uk_golf_api_course_candidates")
    .select("*")
    .eq("review_status", "approved")
    .order("imported_at", { ascending: true });
  if (cErr) throw new Error(cErr.message);
  const courseRows = (courses ?? []) as Array<Record<string, unknown>>;
  if (courseRows.length === 0) {
    return { courses: [], teesByCourse: new Map() };
  }
  const ids = courseRows.map((c) => String(c.id));
  const { data: tees, error: tErr } = await supabase.from("uk_golf_api_tee_candidates").select("*").in("course_candidate_id", ids);
  if (tErr) throw new Error(tErr.message);
  const teesByCourse = new Map<string, Array<Record<string, unknown>>>();
  for (const t of tees ?? []) {
    const row = t as Record<string, unknown>;
    const cid = String(row.course_candidate_id);
    const list = teesByCourse.get(cid) ?? [];
    list.push(row);
    teesByCourse.set(cid, list);
  }
  return { courses: courseRows, teesByCourse };
}

async function fetchHolesForTee(supabase: SupabaseClient, teeCandidateId: string): Promise<HoleRow[]> {
  const { data, error } = await supabase
    .from("uk_golf_api_hole_candidates")
    .select("hole_number, par, yardage, stroke_index")
    .eq("tee_candidate_id", teeCandidateId)
    .order("hole_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    hole_number: Number((r as { hole_number: number }).hole_number),
    par: (r as { par: number | null }).par,
    yardage: (r as { yardage: number | null }).yardage,
    stroke_index: (r as { stroke_index: number | null }).stroke_index,
  }));
}

async function findLiveCourse(
  supabase: SupabaseClient,
  providerCourseId: string,
): Promise<{ id: string; golfer_data_status: string | null; dedupe_key: string | null } | null> {
  const { data: byProv, error: e1 } = await supabase
    .from("courses")
    .select("id, golfer_data_status, dedupe_key")
    .eq("source_provider_course_id", providerCourseId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (byProv) return byProv as { id: string; golfer_data_status: string | null; dedupe_key: string | null };

  const dedupe = `uk_golf_api:${providerCourseId}`;
  const { data: byDedupe, error: e2 } = await supabase
    .from("courses")
    .select("id, golfer_data_status, dedupe_key")
    .eq("dedupe_key", dedupe)
    .maybeSingle();
  if (e2) throw new Error(e2.message);
  return (byDedupe as { id: string; golfer_data_status: string | null; dedupe_key: string | null } | null) ?? null;
}

async function main(): Promise<void> {
  const supabase = requireEnv();
  const dry = isDryRun();
  const overwriteVerified = allowVerifiedOverwrite();
  const batchId = randomUUID();

  console.log(`[uk-golf-promote] dryRun=${dry} batchId=${batchId} allowVerifiedOverwrite=${overwriteVerified}`);

  const report = {
    approvedCoursesScanned: 0,
    approvedTeesScanned: 0,
    promotedCourses: 0,
    promotedTees: 0,
    promotedHoles: 0,
    skippedPartialUnverified: 0,
    skippedExistingVerified: 0,
    skippedMissingHoles: 0,
    skippedCourseNoTees: 0,
    errors: [] as string[],
    actions: [] as string[],
  };

  const { courses, teesByCourse } = await fetchApprovedStaging(supabase);
  report.approvedCoursesScanned = courses.length;
  for (const c of courses) {
    const tees = teesByCourse.get(String(c.id)) ?? [];
    report.approvedTeesScanned += tees.filter((t) => String(t.review_status) === "approved").length;
  }

  for (const staged of courses) {
    const stagedId = String(staged.id);
    const providerCourseId = String(staged.provider_course_id ?? "");
    const matchedCourseName =
      (staged.matched_course_name as string | null)?.trim() ||
      (staged.query as string | null)?.trim() ||
      "Unknown course";
    const matchedClubName = (staged.matched_club_name as string | null) ?? null;

    if (!providerCourseId) {
      report.errors.push(`course candidate ${stagedId}: missing provider_course_id`);
      continue;
    }

    const live = await findLiveCourse(supabase, providerCourseId);
    if (live?.golfer_data_status === "verified" && !overwriteVerified) {
      report.skippedExistingVerified += 1;
      report.actions.push(
        `[skip course] ${matchedCourseName} (${providerCourseId}): live course ${live.id} already golfer_data_status=verified`,
      );
      continue;
    }

    const allTees = teesByCourse.get(stagedId) ?? [];
    const candidateTees = allTees.filter(
      (t) =>
        String(t.review_status) === "approved" &&
        t.verified_for_play === true &&
        String(t.validation_status) === "verified_candidate",
    );

    type PromoteTee = {
      teeRow: Record<string, unknown>;
      holes: HoleRow[];
    };
    const toPromote: PromoteTee[] = [];

    for (const teeRow of candidateTees) {
      const teeId = String(teeRow.id);
      const rating = teeRow.course_rating != null ? Number(teeRow.course_rating) : null;
      const slope = teeRow.slope_rating != null ? Number(teeRow.slope_rating) : null;
      if (rating == null || !Number.isFinite(rating) || slope == null || !Number.isFinite(slope)) {
        report.skippedPartialUnverified += 1;
        report.actions.push(`[skip tee] ${teeRow.tee_set}: missing rating/slope`);
        continue;
      }

      let holes: HoleRow[] = [];
      try {
        holes = await fetchHolesForTee(supabase, teeId);
      } catch (e) {
        report.errors.push(`tee ${teeId}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      const si = validateSi18(holes);
      if (!si.ok) {
        report.skippedMissingHoles += 1;
        report.actions.push(`[skip tee] ${teeRow.tee_set}: ${si.reason}`);
        continue;
      }

      toPromote.push({ teeRow, holes });
    }

    if (toPromote.length === 0) {
      report.skippedCourseNoTees += 1;
      report.actions.push(`[skip course] ${matchedCourseName}: no qualifying tees after validation`);
      continue;
    }

    const dedupeKey = `uk_golf_api:${providerCourseId}`;
    const coursePayloadCommon = {
      course_name: matchedCourseName,
      club_name: matchedClubName,
      full_name: matchedClubName ? `${matchedClubName} — ${matchedCourseName}` : matchedCourseName,
      source: "uk_golf_api",
      source_type: "uk_golf_api",
      source_provider_course_id: providerCourseId,
      source_import_batch_id: batchId,
      golfer_data_status: "verified",
      data_confidence: "high",
      validation_basis: "gsh_review",
      enrichment_status: "imported",
      sync_status: "ok",
      last_synced_at: new Date().toISOString(),
      imported_at: new Date().toISOString(),
    };

    if (dry) {
      report.promotedCourses += 1;
      report.promotedTees += toPromote.length;
      report.promotedHoles += toPromote.reduce((s, x) => s + x.holes.length, 0);
      report.actions.push(
        `[dry-run] would upsert course ${matchedCourseName} provider=${providerCourseId} liveId=${live?.id ?? "(new)"} + ${toPromote.length} tee(s)`,
      );
      for (const { teeRow, holes } of toPromote) {
        report.actions.push(
          `[dry-run]   tee ${teeRow.tee_set} holes=${holes.length} providerTee=${teeRow.provider_tee_set_id ?? "null"}`,
        );
      }
      continue;
    }

    let courseId: string;
    try {
      if (live?.id) {
        const dedupeToUse = live.dedupe_key?.trim() ? live.dedupe_key : dedupeKey;
        const { error: upErr } = await supabase
          .from("courses")
          .update({ ...coursePayloadCommon, dedupe_key: dedupeToUse })
          .eq("id", live.id);
        if (upErr) throw new Error(upErr.message);
        courseId = live.id;
        report.actions.push(`[live] updated course ${courseId} (${matchedCourseName})`);
      } else {
        const { data: savedCourse, error: courseUpsertErr } = await supabase
          .from("courses")
          .upsert({ ...coursePayloadCommon, dedupe_key: dedupeKey }, { onConflict: "dedupe_key" })
          .select("id")
          .single();
        if (courseUpsertErr || !savedCourse) throw new Error(courseUpsertErr?.message ?? "course upsert failed");
        courseId = String((savedCourse as { id: string }).id);
        report.actions.push(`[live] upserted course ${courseId} (${matchedCourseName})`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report.errors.push(`course ${providerCourseId}: ${msg}`);
      continue;
    }

    report.promotedCourses += 1;
    let displayOrder = 0;

    for (const { teeRow, holes } of toPromote) {
      const teeName = String(teeRow.tee_set ?? "Tee");
      const providerTeeSetId = teeRow.provider_tee_set_id != null ? String(teeRow.provider_tee_set_id) : null;
      const teePatch = {
        course_id: courseId,
        tee_name: teeName,
        tee_color: (teeRow.tee_colour as string | null) ?? null,
        gender: (teeRow.tee_gender as string | null) ?? null,
        course_rating: Number(teeRow.course_rating),
        slope_rating: Math.round(Number(teeRow.slope_rating)),
        par_total: teeRow.par_total != null ? Math.round(Number(teeRow.par_total)) : null,
        yards: teeRow.total_yardage != null ? Math.round(Number(teeRow.total_yardage)) : null,
        source_type: "uk_golf_api",
        source_provider_tee_set_id: providerTeeSetId,
        source_import_batch_id: batchId,
        is_active: true,
        deactivated_at: null,
        display_order: displayOrder,
        sync_status: "ok",
        last_synced_at: new Date().toISOString(),
        imported_at: new Date().toISOString(),
      };
      displayOrder += 1;

      try {
        const { data: teeSaved, error: teeErr } = await supabase
          .from("course_tees")
          .upsert(teePatch, { onConflict: "course_id,tee_name" })
          .select("id")
          .single();
        if (teeErr || !teeSaved) throw new Error(teeErr?.message ?? "tee upsert failed");
        const liveTeeId = String((teeSaved as { id: string }).id);

        const holeRows = holes.map((h) => ({
          course_id: courseId,
          tee_id: liveTeeId,
          hole_number: h.hole_number,
          par: h.par,
          yardage: h.yardage,
          stroke_index: h.stroke_index,
          source_import_batch_id: batchId,
          source_type: "uk_golf_api",
          sync_status: "ok",
          last_synced_at: new Date().toISOString(),
          imported_at: new Date().toISOString(),
        }));

        const { error: hErr } = await supabase.from("course_holes").upsert(holeRows, {
          onConflict: "course_id,tee_id,hole_number",
        });
        if (hErr) throw new Error(hErr.message);

        report.promotedTees += 1;
        report.promotedHoles += holes.length;
        report.actions.push(`[live] upserted tee ${teeName} (${liveTeeId}) + ${holes.length} holes`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        report.errors.push(`tee ${teeName} course ${courseId}: ${msg}`);
      }
    }
  }

  console.log("\n=== UK Golf API promotion report ===\n");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
