import path from "path";
import { promises as fs } from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  MATCH_CONFIDENCE_HIGH,
  MATCH_CONFIDENCE_REVIEW,
  resolveCourseEnrichment,
  type CandidateCourse,
  type CandidateTee,
  type SeedCourse,
} from "../../lib/course-enrichment";
import {
  boundedNumber,
  haversineDistanceKm,
  normalizeCourseText,
  tokenizeNormalized,
} from "../../lib/course-normalize";

type Args = {
  dryRun: boolean;
  courseId?: string;
  limit: number;
  countryCode: string;
  candidatesFile?: string;
  source: string;
  highThreshold: number;
  reviewThreshold: number;
};

type PendingCourseRow = SeedCourse & {
  enrichment_status: string;
};

type EnrichmentCounters = {
  matched: number;
  needs_review: number;
  failed: number;
  skipped: number;
};

type LooseSupabase = any;

const DEFAULT_LIMIT = 200;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    limit: DEFAULT_LIMIT,
    countryCode: "gb",
    source: "fairway_forecast_enrichment",
    highThreshold: MATCH_CONFIDENCE_HIGH,
    reviewThreshold: MATCH_CONFIDENCE_REVIEW,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
    if (token === "--course-id") args.courseId = argv[i + 1];
    if (token === "--limit") args.limit = Number.parseInt(argv[i + 1] || `${DEFAULT_LIMIT}`, 10);
    if (token === "--country") args.countryCode = (argv[i + 1] || "gb").toLowerCase();
    if (token === "--candidates-file") args.candidatesFile = argv[i + 1];
    if (token === "--source") args.source = argv[i + 1] || args.source;
    if (token === "--high-threshold") args.highThreshold = Number.parseFloat(argv[i + 1] || `${MATCH_CONFIDENCE_HIGH}`);
    if (token === "--review-threshold") args.reviewThreshold = Number.parseFloat(argv[i + 1] || `${MATCH_CONFIDENCE_REVIEW}`);
  }

  return args;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveCandidatesPath(args: Args): Promise<string> {
  const candidates = [
    args.candidatesFile,
    process.env.COURSE_ENRICHMENT_CANDIDATES_PATH,
    path.resolve(process.cwd(), "../fairway-forecast/data/courses/gb-enriched.json"),
    path.resolve(process.cwd(), "../fairway-forecast/data/courses/gb_tees.json"),
    path.resolve(process.cwd(), "../fairway-forecast/data/courses/gb.courses.enriched.json"),
  ].filter((value): value is string => !!value);

  for (const candidate of candidates) {
    const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
    if (await exists(absolute)) return absolute;
  }

  throw new Error(
    "Candidates file not found. Provide --candidates-file or COURSE_ENRICHMENT_CANDIDATES_PATH."
  );
}

function parseTee(raw: any, source: string, fallbackRef: string): CandidateTee | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    const teeName = typeof raw[0] === "string" ? raw[0] : "";
    if (!teeName.trim()) return null;
    return {
      tee_name: teeName.trim(),
      tee_color: typeof raw[1] === "string" ? raw[1] : null,
      gender: typeof raw[2] === "string" ? raw[2] : null,
      par: boundedNumber(raw[3]),
      course_rating: boundedNumber(raw[4]),
      slope_rating: boundedNumber(raw[5]),
      source,
      source_ref: fallbackRef,
    };
  }

  const teeName = String(raw.tee_name ?? raw.name ?? "").trim();
  if (!teeName) return null;

  return {
    tee_name: teeName,
    tee_color: raw.tee_color ?? raw.color ?? null,
    gender: raw.gender ?? raw.sex ?? null,
    par: boundedNumber(raw.par),
    course_rating: boundedNumber(raw.course_rating ?? raw.rating),
    slope_rating: boundedNumber(raw.slope_rating ?? raw.slope),
    source: String(raw.source ?? source),
    source_ref: String(raw.source_ref ?? raw.ref ?? fallbackRef),
  };
}

function parseCandidate(raw: any, index: number, defaultSource: string): CandidateCourse | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    const name = typeof raw[0] === "string" ? raw[0].trim() : "";
    const lat = boundedNumber(raw[1]);
    const lng = boundedNumber(raw[2]);
    const area = typeof raw[3] === "string" ? raw[3] : "";
    if (!name || lat === null || lng === null) return null;

    const teesRaw = Array.isArray(raw[4]) ? raw[4] : [];
    const sourceRef = `array:${index + 1}`;
    return {
      name,
      area,
      lat,
      lng,
      source: defaultSource,
      source_ref: sourceRef,
      tees: teesRaw
        .map((tee: unknown) => parseTee(tee, defaultSource, sourceRef))
        .filter((tee: CandidateTee | null): tee is CandidateTee => !!tee),
      payload: raw,
    };
  }

  const node = raw.course ?? raw;
  const name = String(node.name ?? node.course_name ?? "").trim();
  const lat = boundedNumber(node.lat ?? node.latitude);
  const lng = boundedNumber(node.lng ?? node.lon ?? node.longitude);
  const area = String(node.area ?? node.town ?? node.county ?? "").trim();
  if (!name || lat === null || lng === null) return null;

  const source = String(node.source ?? raw.source ?? defaultSource);
  const sourceRef = String(node.source_ref ?? raw.source_ref ?? node.id ?? `obj:${index + 1}`);
  const teesRaw = Array.isArray(node.tees) ? node.tees : Array.isArray(raw.tees) ? raw.tees : [];

  return {
    name,
    area,
    lat,
    lng,
    source,
    source_ref: sourceRef,
    tees: teesRaw
      .map((tee: unknown) => parseTee(tee, source, sourceRef))
      .filter((tee: CandidateTee | null): tee is CandidateTee => !!tee),
    payload: raw,
  };
}

async function loadCandidates(filePath: string, source: string): Promise<CandidateCourse[]> {
  const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error("Expected enrichment candidates JSON to be an array.");
  }

  const candidates = raw
    .map((entry, index) => parseCandidate(entry, index, source))
    .filter((entry): entry is CandidateCourse => !!entry);

  if (candidates.length === 0) {
    throw new Error("No valid enrichment candidates parsed from file.");
  }
  return candidates;
}

function prefilterCandidates(seed: SeedCourse, candidates: CandidateCourse[]): CandidateCourse[] {
  const seedTokens = new Set(tokenizeNormalized(seed.name));
  const normalizedArea = normalizeCourseText(seed.area ?? "");

  return candidates.filter((candidate) => {
    const candidateTokens = tokenizeNormalized(candidate.name);
    const sharesToken = candidateTokens.some((token) => seedTokens.has(token));
    const areaOverlap =
      normalizedArea.length > 0 &&
      normalizeCourseText(candidate.area ?? "").includes(normalizedArea);
    const distance = haversineDistanceKm(seed.lat, seed.lng, candidate.lat, candidate.lng);
    return sharesToken || areaOverlap || distance <= 40;
  });
}

async function loadPendingCourses(
  supabase: LooseSupabase,
  args: Args
): Promise<PendingCourseRow[]> {
  let query = supabase
    .from("courses")
    .select("id, name, area, lat, lng, normalized_name, enrichment_status")
    .eq("source_country_code", args.countryCode);

  if (args.courseId) {
    query = query.eq("id", args.courseId);
  } else {
    query = query.eq("enrichment_status", "pending").limit(args.limit);
  }

  const { data, error } = await query.order("updated_at", { ascending: true });
  if (error) throw new Error(error.message || "Failed to load pending courses");
  return (data ?? []) as PendingCourseRow[];
}

async function logRun(
  supabase: LooseSupabase,
  courseId: string,
  status: string,
  source: string,
  notes: string,
  payload: Record<string, unknown>
) {
  const { error } = await supabase.from("course_enrichment_runs").insert({
    course_id: courseId,
    status,
    source,
    notes,
    payload,
  });
  if (error) {
    throw new Error(error.message || "Failed to insert enrichment run");
  }
}

async function applyMatchedResult(
  supabase: LooseSupabase,
  course: PendingCourseRow,
  matchedSource: string | null,
  matchedName: string | null,
  confidence: number | null,
  tees: CandidateTee[]
) {
  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("courses")
    .update({
      enrichment_status: "matched",
      matched_source: matchedSource,
      matched_name: matchedName,
      match_confidence: confidence,
      updated_at: nowIso,
    })
    .eq("id", course.id);
  if (updateError) throw new Error(updateError.message || "Failed to update matched course");

  const rows = tees
    .filter((tee) => tee.tee_name && tee.tee_name.trim().length > 0)
    .map((tee, index) => ({
      course_id: course.id,
      tee_name: tee.tee_name.trim(),
      tee_color: tee.tee_color ?? null,
      gender: tee.gender ?? "mixed",
      par: tee.par ?? null,
      course_rating: tee.course_rating ?? null,
      slope_rating: tee.slope_rating ?? null,
      source: tee.source ?? matchedSource ?? "enrichment_match",
      source_ref: tee.source_ref ?? `${course.id}:${index + 1}`,
      is_verified: false,
    }));

  if (rows.length > 0) {
    const { error: teeError } = await supabase
      .from("tees")
      .upsert(rows, { onConflict: "course_id,source,source_ref" });
    if (teeError) throw new Error(teeError.message || "Failed to upsert tee rows");
  }
}

async function applyNeedsReviewResult(
  supabase: LooseSupabase,
  courseId: string,
  matchedSource: string | null,
  matchedName: string | null,
  confidence: number | null
) {
  const { error } = await supabase
    .from("courses")
    .update({
      enrichment_status: "needs_review",
      matched_source: matchedSource,
      matched_name: matchedName,
      match_confidence: confidence,
      updated_at: new Date().toISOString(),
    })
    .eq("id", courseId);
  if (error) throw new Error(error.message || "Failed to update needs_review course");
}

async function markFailed(
  supabase: LooseSupabase,
  courseId: string,
  message: string
) {
  const { error } = await supabase
    .from("courses")
    .update({
      enrichment_status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", courseId);
  if (error) {
    console.error("[enrich-courses] failed to mark course failed:", { courseId, message: error.message });
  }
  await logRun(supabase, courseId, "failed", "enrichment_script", message, { error: message });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const candidatesPath = await resolveCandidatesPath(args);
  const candidates = await loadCandidates(candidatesPath, args.source);
  console.log("[enrich-courses] candidate file:", candidatesPath);
  console.log("[enrich-courses] candidates parsed:", candidates.length);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pendingCourses = await loadPendingCourses(supabase, args);
  if (pendingCourses.length === 0) {
    console.log("[enrich-courses] No pending courses found.");
    return;
  }

  const counters: EnrichmentCounters = {
    matched: 0,
    needs_review: 0,
    failed: 0,
    skipped: 0,
  };

  for (const course of pendingCourses) {
    try {
      const filtered = prefilterCandidates(course, candidates);
      const decision = resolveCourseEnrichment(course, filtered, {
        highThreshold: args.highThreshold,
        reviewThreshold: args.reviewThreshold,
      });

      const notes = decision.notes.join(" | ");
      if (!args.dryRun) {
        await logRun(
          supabase,
          course.id,
          decision.status,
          decision.matchedSource ?? args.source,
          notes || decision.status,
          decision.payload
        );
      }

      if (decision.status === "matched") {
        counters.matched += 1;
        if (!args.dryRun) {
          await applyMatchedResult(
            supabase,
            course,
            decision.matchedSource,
            decision.matchedName,
            decision.confidence,
            decision.proposedTees
          );
        }
      } else if (decision.status === "needs_review") {
        counters.needs_review += 1;
        if (!args.dryRun) {
          await applyNeedsReviewResult(
            supabase,
            course.id,
            decision.matchedSource,
            decision.matchedName,
            decision.confidence
          );
        }
      } else {
        counters.skipped += 1;
      }
    } catch (error: any) {
      counters.failed += 1;
      const message = error?.message || "Unknown enrichment failure";
      console.error("[enrich-courses] course failed:", { courseId: course.id, message });
      if (!args.dryRun) {
        await markFailed(supabase, course.id, message);
      }
    }
  }

  console.log("[enrich-courses] summary");
  console.log("  matched:", counters.matched);
  console.log("  needs_review:", counters.needs_review);
  console.log("  failed:", counters.failed);
  console.log("  skipped:", counters.skipped);
}

main().catch((error) => {
  console.error("[enrich-courses] fatal:", error?.message || error);
  process.exit(1);
});
