import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  UkGolfApiProvider,
  UkGolfApiRateLimitError,
  classifyUkDryRunStatus,
  normalizeUkTeeLabel,
  validateUkGolfTee,
} from "@/lib/server/ukGolfApiProvider";

dotenv.config();

type QueueStatus = "pending" | "processing" | "staged" | "partial" | "failed" | "rate_limited" | "skipped";
type QueueRow = {
  id: string;
  territory: "england" | "wales" | "scotland" | "ni";
  query: string;
  club_id: string | null;
  course_id: string | null;
  status: QueueStatus;
  priority: number;
  attempts: number;
  next_attempt_after: string | null;
};

export type ProcessSummary = {
  queuePending: number;
  queueStaged: number;
  queuePartial: number;
  queueFailed: number;
  processedThisRun: number;
  requestsMade: number;
  rateLimitEvents: number;
  retries: number;
  successfulItems: number;
  failedItems: number;
  stagedCourses: number;
  stagedTees: number;
  stagedHoles: number;
  fallbackDiscoveryCalls: number;
  stoppedReason:
    | "queue_empty"
    | "max_items_reached"
    | "request_budget_reached"
    | "rate_limit_threshold_reached"
    | "missing_provider_key";
};

/** Default summary when the processor did not run (used for nightly reports). */
export function emptyProcessSummary(
  stoppedReason: ProcessSummary["stoppedReason"] = "queue_empty",
): ProcessSummary {
  return {
    queuePending: 0,
    queueStaged: 0,
    queuePartial: 0,
    queueFailed: 0,
    processedThisRun: 0,
    requestsMade: 0,
    rateLimitEvents: 0,
    retries: 0,
    successfulItems: 0,
    failedItems: 0,
    stagedCourses: 0,
    stagedTees: 0,
    stagedHoles: 0,
    fallbackDiscoveryCalls: 0,
    stoppedReason,
  };
}

function requireSupabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url, key };
}

function resolveRapidApiKeyFromEnv(): string {
  return (
    process.env.RAPIDAPI_KEY ||
    process.env.GOLFCOURSE_API_KEY ||
    process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY ||
    process.env.NEXT_PUBLIC_GOLF_API_KEY ||
    ""
  ).trim();
}

function backoffMsForFailedAttempt(attempts: number): number {
  // 1h, 2h, 4h for attempts 1..3
  return Math.min(4, Math.max(1, 2 ** Math.max(0, attempts - 1))) * 60 * 60 * 1000;
}

async function fetchRetryableQueueRows(
  supabase: SupabaseClient,
  maxItems: number,
): Promise<QueueRow[]> {
  const { data, error } = await supabase
    .from("uk_golf_api_seed_queue")
    .select("id, territory, query, club_id, course_id, status, priority, attempts, next_attempt_after")
    .in("status", ["pending", "failed", "rate_limited"])
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message || "Failed to load queue rows");
  const now = Date.now();
  return ((data ?? []) as QueueRow[])
    .filter((row) => {
      if (row.status === "failed" && (row.attempts ?? 0) >= 3) return false;
      if (!row.next_attempt_after) return true;
      const t = Date.parse(row.next_attempt_after);
      return Number.isFinite(t) && t <= now;
    })
    .slice(0, maxItems);
}

async function patchQueueRow(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("uk_golf_api_seed_queue").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message || "Failed updating queue row");
}

async function processQueueItem(
  supabase: SupabaseClient,
  provider: UkGolfApiProvider,
  row: QueueRow,
): Promise<{
  finalStatus: Exclude<QueueStatus, "pending" | "processing">;
  stagedCourseCandidateId: string | null;
  stagedCourses: number;
  stagedTees: number;
  stagedHoles: number;
  error: string | null;
}> {
  const nowIso = new Date().toISOString();
  await patchQueueRow(supabase, row.id, {
    status: "processing",
    attempts: (row.attempts ?? 0) + 1,
    last_attempted_at: nowIso,
    last_error: null,
  });
  const currentAttempts = (row.attempts ?? 0) + 1;

  try {
    const club =
      row.club_id != null
        ? await provider.getClub(row.club_id)
        : (await provider.searchClubs(row.query))[0] ?? null;
    if (!club) {
      await patchQueueRow(supabase, row.id, {
        status: "skipped",
        next_attempt_after: null,
        last_error: "no_club_match",
      });
      return {
        finalStatus: "skipped",
        stagedCourseCandidateId: null,
        stagedCourses: 0,
        stagedTees: 0,
        stagedHoles: 0,
        error: "no_club_match",
      };
    }

    let course = null as Awaited<ReturnType<UkGolfApiProvider["getClubCourses"]>>[number] | null;
    const courses = await provider.getClubCourses(club.id);
    if (row.course_id) {
      course = courses.find((c) => c.id === row.course_id) ?? null;
    }
    if (!course) course = courses[0] ?? null;
    if (!course) {
      await patchQueueRow(supabase, row.id, {
        status: "skipped",
        next_attempt_after: null,
        last_error: "no_course_match",
      });
      return {
        finalStatus: "skipped",
        stagedCourseCandidateId: null,
        stagedCourses: 0,
        stagedTees: 0,
        stagedHoles: 0,
        error: "no_course_match",
      };
    }

    const detail = await provider.getCourseDetail(course.id).catch(() => null);
    const sourceTees = detail?.tees ?? [];
    const scorecard = sourceTees.length > 0 ? { tees: sourceTees, raw: detail?.raw ?? {} } : await provider.getCourseScorecard(course.id);
    const tees = sourceTees.length > 0 ? sourceTees : scorecard.tees;
    if (!tees || tees.length === 0) {
      await patchQueueRow(supabase, row.id, {
        status: "skipped",
        next_attempt_after: null,
        last_error: "no_tee_data",
      });
      return {
        finalStatus: "skipped",
        stagedCourseCandidateId: null,
        stagedCourses: 0,
        stagedTees: 0,
        stagedHoles: 0,
        error: "no_tee_data",
      };
    }

    const normalizedTees = tees.map((tee) => {
      const normalizedLabel = normalizeUkTeeLabel(tee.teeName ?? undefined);
      const checksum = createHash("sha256")
        .update(
          JSON.stringify({
            teeSet: tee.teeName,
            holes: tee.holes,
            courseRating: tee.courseRating,
            slopeRating: tee.slopeRating,
            totalYardage: tee.totalYardage,
          }),
        )
        .digest("hex");
      const singleStatus = classifyUkDryRunStatus(
        { courseId: course.id, tees: [tee], sourceUpdatedAt: null, raw: {} },
        [validateUkGolfTee(tee)],
      );
      return {
        tee,
        status: singleStatus,
        checksum,
      };
    });

    const courseStatus = classifyUkDryRunStatus({
      courseId: course.id,
      tees,
      sourceUpdatedAt: null,
      raw: scorecard.raw ?? {},
    });
    const courseVerifiedForPlay = normalizedTees.some(
      (t) => t.status === "verified_candidate" && t.tee.courseRating != null && t.tee.slopeRating != null,
    );
    const courseChecksum = createHash("sha256").update(JSON.stringify(scorecard.raw ?? {})).digest("hex");

    const { data: courseRow, error: courseErr } = await supabase
      .from("uk_golf_api_course_candidates")
      .upsert(
        {
          provider_course_id: course.id,
          provider_club_id: club.id,
          query: row.query,
          matched_club_name: club.name,
          matched_course_name: course.name,
          validation_status: courseStatus,
          verified_for_play: courseVerifiedForPlay,
          raw_json_checksum: courseChecksum,
          imported_at: nowIso,
        },
        { onConflict: "provider_course_id" },
      )
      .select("id")
      .single();
    if (courseErr || !courseRow?.id) {
      throw new Error(courseErr?.message || "Failed to stage course candidate");
    }

    let stagedTees = 0;
    let stagedHoles = 0;
    for (const item of normalizedTees) {
      const tee = item.tee;
      const teeVerifiedForPlay =
        item.status === "verified_candidate" &&
        tee.courseRating != null &&
        tee.slopeRating != null &&
        tee.holes.length === 18 &&
        tee.holes.every((h) => h.par != null && h.yardage != null && h.strokeIndex != null);
      if (!teeVerifiedForPlay) continue;

      const { data: teeRow, error: teeErr } = await supabase
        .from("uk_golf_api_tee_candidates")
        .upsert(
          {
            course_candidate_id: courseRow.id,
            provider_tee_set_id:
              tee.providerTeeSetId ??
              `${(tee.teeName ?? "default").toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${tee.totalYardage ?? 0}`,
            tee_set: normalizeUkTeeLabel(tee.teeName).teeSet,
            tee_colour: normalizeUkTeeLabel(tee.teeName).teeColour,
            tee_gender: normalizeUkTeeLabel(tee.teeName).gender,
            course_rating: tee.courseRating,
            slope_rating: tee.slopeRating,
            par_total: tee.parTotal,
            total_yardage: tee.totalYardage,
            validation_status: item.status,
            verified_for_play: teeVerifiedForPlay,
            validation_summary: {},
            raw_json_checksum: item.checksum,
            review_status: "pending",
            imported_at: nowIso,
          },
          { onConflict: "course_candidate_id,provider_tee_set_id" },
        )
        .select("id")
        .single();
      if (teeErr || !teeRow?.id) throw new Error(teeErr?.message || "Failed to stage tee candidate");
      stagedTees += 1;

      const holeRows = tee.holes.map((h) => ({
        tee_candidate_id: teeRow.id,
        hole_number: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
        stroke_index: h.strokeIndex,
        imported_at: nowIso,
      }));
      if (holeRows.length > 0) {
        const { error: holeErr } = await supabase
          .from("uk_golf_api_hole_candidates")
          .upsert(holeRows, { onConflict: "tee_candidate_id,hole_number" });
        if (holeErr) throw new Error(holeErr.message || "Failed to stage hole candidates");
        stagedHoles += holeRows.length;
      }
    }

    const finalStatus: Exclude<QueueStatus, "pending" | "processing"> = stagedTees > 0 ? "staged" : "partial";
    await patchQueueRow(supabase, row.id, {
      status: finalStatus,
      next_attempt_after: null,
      staged_course_candidate_id: courseRow.id,
      last_error: null,
    });
    return {
      finalStatus,
      stagedCourseCandidateId: String(courseRow.id),
      stagedCourses: 1,
      stagedTees,
      stagedHoles,
      error: null,
    };
  } catch (error) {
    if (error instanceof UkGolfApiRateLimitError) {
      const next = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      await patchQueueRow(supabase, row.id, {
        status: "rate_limited",
        next_attempt_after: next,
        last_error: `RATE_LIMITED retryAfterMs=${error.retryAfterMs}`,
      });
      return {
        finalStatus: "rate_limited",
        stagedCourseCandidateId: null,
        stagedCourses: 0,
        stagedTees: 0,
        stagedHoles: 0,
        error: "RATE_LIMITED",
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    const retryable = currentAttempts < 3;
    await patchQueueRow(supabase, row.id, {
      status: "failed",
      next_attempt_after: retryable ? new Date(Date.now() + backoffMsForFailedAttempt(currentAttempts)).toISOString() : null,
      last_error: message.slice(0, 500),
    });
    return {
      finalStatus: "failed",
      stagedCourseCandidateId: null,
      stagedCourses: 0,
      stagedTees: 0,
      stagedHoles: 0,
      error: message,
    };
  }
}

async function countQueueStatuses(supabase: SupabaseClient): Promise<{
  queuePending: number;
  queueStaged: number;
  queuePartial: number;
  queueFailed: number;
}> {
  const count = async (status: QueueStatus): Promise<number> => {
    const { count, error } = await supabase
      .from("uk_golf_api_seed_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [queuePending, queueStaged, queuePartial, queueFailed, queueRateLimited] = await Promise.all([
    count("pending"),
    count("staged"),
    count("partial"),
    count("failed"),
    count("rate_limited"),
  ]);
  return {
    queuePending: queuePending + queueRateLimited,
    queueStaged,
    queuePartial,
    queueFailed,
  };
}

export async function runUkGolfApiProcessQueue(): Promise<ProcessSummary> {
  const { url, key } = requireSupabaseConfig();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const maxItems = Math.max(1, Number(process.env.UK_GOLF_API_MAX_QUEUE_ITEMS_PER_RUN ?? 25));
  const maxRequests = Math.max(1, Number(process.env.UK_GOLF_API_MAX_REQUESTS_PER_RUN ?? 150));
  const requestDelayMs = Math.max(0, Number(process.env.UK_GOLF_API_DELAY_MS ?? 7000));
  const requestJitterMs = Math.max(0, Number(process.env.UK_GOLF_API_JITTER_MS ?? 1000));

  const rapidApiKey = resolveRapidApiKeyFromEnv();
  if (!rapidApiKey) {
    const q = await countQueueStatuses(supabase);
    return {
      ...q,
      processedThisRun: 0,
      requestsMade: 0,
      rateLimitEvents: 0,
      retries: 0,
      successfulItems: 0,
      failedItems: 0,
      stagedCourses: 0,
      stagedTees: 0,
      stagedHoles: 0,
      fallbackDiscoveryCalls: 0,
      stoppedReason: "missing_provider_key",
    };
  }

  const provider = new UkGolfApiProvider({ rapidApiKey, requestDelayMs, requestJitterMs });
  provider.assertConfigured();
  const queueRows = await fetchRetryableQueueRows(supabase, maxItems);
  if (queueRows.length === 0) {
    const q = await countQueueStatuses(supabase);
    return {
      ...q,
      processedThisRun: 0,
      requestsMade: 0,
      rateLimitEvents: 0,
      retries: 0,
      successfulItems: 0,
      failedItems: 0,
      stagedCourses: 0,
      stagedTees: 0,
      stagedHoles: 0,
      fallbackDiscoveryCalls: 0,
      stoppedReason: "queue_empty",
    };
  }

  let processedThisRun = 0;
  let requestsMade = 0;
  let rateLimitEvents = 0;
  let retries = 0;
  let successfulItems = 0;
  let failedItems = 0;
  let stagedCourses = 0;
  let stagedTees = 0;
  let stagedHoles = 0;
  let fallbackDiscoveryCalls = 0;
  let stoppedReason: ProcessSummary["stoppedReason"] = "max_items_reached";

  for (const row of queueRows) {
    if (requestsMade >= maxRequests) {
      stoppedReason = "request_budget_reached";
      break;
    }
    if (rateLimitEvents >= 3) {
      stoppedReason = "rate_limit_threshold_reached";
      break;
    }

    const result = await processQueueItem(supabase, provider, row);
    processedThisRun += 1;
    stagedCourses += result.stagedCourses;
    stagedTees += result.stagedTees;
    stagedHoles += result.stagedHoles;
    if (result.finalStatus === "failed") failedItems += 1;
    else if (result.finalStatus === "rate_limited") rateLimitEvents += 1;
    else successfulItems += 1;

    const requestDelta = provider.getAndResetRequestSummary();
    requestsMade += requestDelta.totalRequests;
    retries += requestDelta.totalRetries;
    fallbackDiscoveryCalls += provider.getAndResetFallbackDiscoveryCalls();

    if (requestsMade >= maxRequests) {
      stoppedReason = "request_budget_reached";
      break;
    }
    if (rateLimitEvents >= 3) {
      stoppedReason = "rate_limit_threshold_reached";
      break;
    }
  }

  if (processedThisRun < queueRows.length && stoppedReason === "max_items_reached") {
    stoppedReason = "max_items_reached";
  } else if (processedThisRun === queueRows.length && stoppedReason === "max_items_reached") {
    stoppedReason = queueRows.length >= maxItems ? "max_items_reached" : "queue_empty";
  }

  const q = await countQueueStatuses(supabase);
  return {
    ...q,
    processedThisRun,
    requestsMade,
    rateLimitEvents,
    retries,
    successfulItems,
    failedItems,
    stagedCourses,
    stagedTees,
    stagedHoles,
    fallbackDiscoveryCalls,
    stoppedReason,
  };
}

async function main(): Promise<void> {
  const summary = await runUkGolfApiProcessQueue();
  console.log("[uk-golf-api:nightly-summary]");
  console.log(JSON.stringify(summary, null, 2));
}

function ranAsCliEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolvePath(entry)).href;
  } catch {
    return false;
  }
}

if (ranAsCliEntrypoint()) {
  void main().catch((error) => {
    console.error("[uk-golf-api:process-queue] fatal:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
