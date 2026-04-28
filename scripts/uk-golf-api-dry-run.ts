import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { normalizeGolfCourseApiCourse } from "@/lib/courseNormalizer";
import { getCourseById, searchCourses } from "@/lib/golfApi";
import {
  computeCompleteness,
  computeVerifiedForPlay,
  mergeCourseData,
  type MergeCourseData,
} from "@/lib/server/courseMergePromotion";
import {
  classifyUkDryRunStatus,
  deriveUkGolfSourceTracking,
  normalizeUkTeeLabel,
  summarizeRawShape,
  summarizeUkGolfCompleteness,
  sortUkTeesByPreferredOrder,
  toNormalizedCourseImportFromUkGolf,
  UkGolfApiProvider,
  type TeeValidationResult,
  validateUkGolfTee,
} from "@/lib/server/ukGolfApiProvider";

dotenv.config();

function resolveRapidApiKeyFromEnv(): string {
  return (
    process.env.RAPIDAPI_KEY ||
    process.env.GOLFCOURSE_API_KEY ||
    process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY ||
    process.env.NEXT_PUBLIC_GOLF_API_KEY ||
    ""
  ).trim();
}

type QueryOutcome = {
  query: string;
  courseName: string;
  uk: ReturnType<typeof summarizeUkGolfCompleteness>;
  ukValidationIssues: number;
  tracking: ReturnType<typeof deriveUkGolfSourceTracking>;
  golfApi: {
    found: boolean;
    completenessScore: number;
    teesFound: number;
    teesWithRatingSlope: number;
    teesWithCompleteSi: number;
  };
  comparison: "uk_better" | "golf_api_better" | "tie" | "unknown";
  reason: string;
  parserShapeSuspect: boolean;
  rawShapeSummary: ReturnType<typeof summarizeRawShape>;
  dryRunStatus: "verified_candidate" | "partial" | "unverified";
  ukTeeSnapshot: {
    teeSet: string | null;
    courseRating: number | null;
    slopeRating: number | null;
    parTotal: number | null;
    totalYardage: number | null;
    siCompleteness: string;
    first3Holes: Array<{
      holeNumber: number;
      par: number | null;
      yardage: number | null;
      strokeIndex: number | null;
    }>;
  };
  validationBreakdown: {
    missingSiCount: number;
    duplicateSiCount: number;
    siOutOfRangeCount: number;
    missingParCount: number;
    missingYardageCount: number;
    parMismatchCount: number;
    yardageMismatchCount: number;
  };
  verifiedForPlay: boolean;
  providerCourseId: string;
  providerClubId: string;
  matchedClubName: string;
  matchedCourseName: string;
  rawJsonChecksum: string;
  fullHoles: Array<{
    holeNumber: number;
    par: number | null;
    yardage: number | null;
    strokeIndex: number | null;
  }>;
  discoveredTeeSets: Array<{ id: string | null; label: string }>;
  fetchedTeeCandidates: Array<{
    requestedTeeSetId: string | null;
    requestedTeeLabel: string;
    returnedTeeSet: string | null;
    checksum: string;
  }>;
  perTeeFetchSupported: boolean;
  warnings: string[];
  courseWarnings: string[];
  fallbackDiscoveryCalls: number;
  defaultPlayableTee: {
    maleMixed: string | null;
    female: string | null;
  };
  primaryTeePerColour: Record<string, {
    teeSet: string | null;
    providerTeeSetId: string | null;
    totalYardage: number | null;
  } | null>;
  courseTrustScore: number;
  courseTrustLevel: "high" | "medium" | "low";
  teeCandidates: Array<{
    providerTeeSetId: string | null;
    teeSet: string | null;
    teeColour: string | null;
    teeGender: "M" | "F" | null;
    courseRating: number | null;
    slopeRating: number | null;
    parTotal: number | null;
    totalYardage: number | null;
    holes: Array<{
      holeNumber: number;
      par: number | null;
      yardage: number | null;
      strokeIndex: number | null;
    }>;
    dryRunStatus: "verified_candidate" | "partial" | "unverified";
    verifiedForPlay: boolean;
    validationBreakdown: {
      missingSiCount: number;
      duplicateSiCount: number;
      siOutOfRangeCount: number;
      missingParCount: number;
      missingYardageCount: number;
      parMismatchCount: number;
      yardageMismatchCount: number;
    };
    warnings: string[];
    canonicalTeeKey: string;
  }>;
  promotion: {
    candidateSource: "primary_verified" | "golfcourseapi" | "uk_golf_api" | null;
    promotionCandidate: boolean;
    upgradeReason: "adds_stroke_index" | "adds_rating_slope" | "fixes_incomplete_holes" | "better_data_quality" | null;
  };
};

type StagingCandidate = {
  query: string;
  providerCourseId: string;
  providerClubId: string;
  matchedClubName: string;
  matchedCourseName: string;
  dryRunStatus: "verified_candidate" | "partial" | "unverified";
  verifiedForPlay: boolean;
  rawJsonChecksum: string;
  tees: Array<{
    providerTeeSetId: string | null;
    teeSet: string | null;
    teeColour: string | null;
    teeGender: "M" | "F" | null;
    courseRating: number | null;
    slopeRating: number | null;
    parTotal: number | null;
    totalYardage: number | null;
    validationStatus: "verified_candidate" | "partial" | "unverified";
    verifiedForPlay: boolean;
    reviewNotes: string | null;
    validationSummary: Record<string, unknown>;
    rawJsonChecksum: string;
    holes: Array<{
      holeNumber: number;
      par: number | null;
      yardage: number | null;
      strokeIndex: number | null;
    }>;
  }>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sample<T>(rows: T[], n: number): T[] {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, Math.max(0, n));
}

function completenessScore(metrics: {
  teesFound: number;
  teesWithRatingSlope: number;
  teesWithCompleteSi: number;
  valid18TeeCount: number;
  validationFailures: number;
}): number {
  return (
    metrics.teesFound * 2 +
    metrics.teesWithRatingSlope * 4 +
    metrics.teesWithCompleteSi * 5 +
    metrics.valid18TeeCount * 8 -
    metrics.validationFailures * 2
  );
}

function golfApiCompleteness(normalized: ReturnType<typeof normalizeGolfCourseApiCourse>) {
  const teesFound = normalized.tees.length;
  const teesWithRatingSlope = normalized.tees.filter((t) => t.tee.courseRating != null && t.tee.slopeRating != null).length;
  const teesWithCompleteSi = normalized.tees.filter((t) => t.holes.length === 18 && t.holes.every((h) => h.strokeIndex != null)).length;
  const valid18TeeCount = normalized.tees.filter((t) => t.holes.length === 18).length;
  return {
    teesFound,
    teesWithRatingSlope,
    teesWithCompleteSi,
    valid18TeeCount,
    score: completenessScore({
      teesFound,
      teesWithRatingSlope,
      teesWithCompleteSi,
      valid18TeeCount,
      validationFailures: 0,
    }),
  };
}

function normalizeName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(golf|club|course|resort|gc|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeName(value).split(" ").filter(Boolean));
}

function tokenOverlapScore(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let common = 0;
  for (const t of sa) {
    if (sb.has(t)) common += 1;
  }
  return common / Math.max(sa.size, sb.size);
}

function rankGolfApiHit(
  hit: { id: number; name: string; club_name?: string; location?: string },
  ukClubName: string,
  ukCourseName: string,
  ukCounty: string | null,
  ukPostcode: string | null,
): number {
  const nameScore = tokenOverlapScore(hit.name, ukCourseName);
  const clubScore = tokenOverlapScore(hit.club_name ?? "", ukClubName);
  const loc = `${hit.location ?? ""}`.toLowerCase();
  const countyBoost = ukCounty && loc.includes(ukCounty.toLowerCase()) ? 0.2 : 0;
  const postcodeBoost = ukPostcode && loc.includes(ukPostcode.toLowerCase().slice(0, 3)) ? 0.2 : 0;
  return nameScore * 0.6 + clubScore * 0.35 + countyBoost + postcodeBoost;
}

function isNonStandardTeeLabel(label: string | null | undefined): boolean {
  const raw = String(label ?? "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (/\bwinter\b/.test(lower)) return true;
  if (/\b(19|20)\d{2}\b/.test(lower)) return true;
  if (/^(yellow|white|red|blue|black|championship)(\s+(male|female|men|women|ladies))?$/i.test(raw)) {
    return false;
  }
  if (/^(members?\s+)?(yellow|white|red|blue|black|championship)(\s+(male|female|men|women|ladies))?$/i.test(raw)) {
    return true;
  }
  return true;
}

function pickDefaultTees(
  teeCandidates: Array<{ teeSet: string | null; teeColour: string | null; teeGender: "M" | "F" | null }>,
): { maleMixed: string | null; female: string | null } {
  const byColor = (color: string, gender?: "M" | "F" | null) =>
    teeCandidates.find((t) => {
      const c = (t.teeColour ?? "").toLowerCase();
      if (c !== color.toLowerCase()) return false;
      if (gender == null) return true;
      return t.teeGender === gender || t.teeGender == null;
    });
  const maleMixed =
    byColor("Yellow", "M")?.teeSet ??
    byColor("Yellow")?.teeSet ??
    byColor("White")?.teeSet ??
    byColor("Red")?.teeSet ??
    byColor("Blue")?.teeSet ??
    teeCandidates[0]?.teeSet ??
    null;
  const female =
    byColor("Red", "F")?.teeSet ??
    byColor("Red")?.teeSet ??
    byColor("Yellow", "F")?.teeSet ??
    byColor("Yellow")?.teeSet ??
    teeCandidates[0]?.teeSet ??
    null;
  return { maleMixed, female };
}

function hasYearLabel(label: string | null | undefined): boolean {
  return /\b(19|20)\d{2}\b/.test(String(label ?? ""));
}

function isWinterLabel(label: string | null | undefined): boolean {
  return /\bwinter\b/i.test(String(label ?? ""));
}

function canonicalTeeKey(
  teeColour: string | null,
  teeGender: "M" | "F" | null,
  totalYardage: number | null,
): string {
  const colour = (teeColour ?? "unknown").toLowerCase().trim();
  const gender = (teeGender ?? "u").toLowerCase();
  const yardBucket = totalYardage != null ? Math.round(totalYardage / 100) * 100 : 0;
  return `${colour}_${gender}_${yardBucket}`;
}

function pickPrimaryTeePerColour(
  teeCandidates: Array<{
    teeSet: string | null;
    teeColour: string | null;
    providerTeeSetId: string | null;
    totalYardage: number | null;
  }>,
): Record<string, { teeSet: string | null; providerTeeSetId: string | null; totalYardage: number | null } | null> {
  const colors = ["Yellow", "White", "Red", "Blue"];
  const out: Record<string, { teeSet: string | null; providerTeeSetId: string | null; totalYardage: number | null } | null> = {};
  for (const color of colors) {
    const pool = teeCandidates.filter((t) => (t.teeColour ?? "").toLowerCase() === color.toLowerCase());
    if (pool.length === 0) {
      out[color] = null;
      continue;
    }
    const sorted = [...pool].sort((a, b) => {
      const aWinter = isWinterLabel(a.teeSet) ? 1 : 0;
      const bWinter = isWinterLabel(b.teeSet) ? 1 : 0;
      if (aWinter !== bWinter) return aWinter - bWinter;
      const aYear = hasYearLabel(a.teeSet) ? 1 : 0;
      const bYear = hasYearLabel(b.teeSet) ? 1 : 0;
      if (aYear !== bYear) return aYear - bYear;
      return (b.totalYardage ?? 0) - (a.totalYardage ?? 0);
    });
    const top = sorted[0]!;
    out[color] = {
      teeSet: top.teeSet,
      providerTeeSetId: top.providerTeeSetId,
      totalYardage: top.totalYardage,
    };
  }
  return out;
}

function computeCourseTrust(
  teeCandidates: Array<{
    dryRunStatus: "verified_candidate" | "partial" | "unverified";
    warnings: string[];
    holes: Array<{ strokeIndex: number | null }>;
  }>,
  courseWarnings: string[],
): { score: number; level: "high" | "medium" | "low" } {
  let score = 0;
  if (teeCandidates.length > 0 && teeCandidates.every((t) => t.dryRunStatus === "verified_candidate")) score += 40;
  if (teeCandidates.length >= 2) score += 20;
  if (courseWarnings.length === 0 && teeCandidates.every((t) => t.warnings.length === 0)) score += 20;
  const validTeeSis = teeCandidates
    .filter((t) => t.holes.length === 18)
    .map((t) => t.holes.map((h) => h.strokeIndex ?? -1).join(","));
  if (validTeeSis.length >= 2 && new Set(validTeeSis).size === 1) score += 20;
  const warningTypes = new Set<string>([
    ...courseWarnings.map((w) => w.split(":")[0]),
    ...teeCandidates.flatMap((t) => t.warnings),
  ]);
  score -= warningTypes.size * 10;
  score = Math.max(0, Math.min(100, score));
  const level: "high" | "medium" | "low" = score >= 80 ? "high" : score >= 50 ? "medium" : "low";
  return { score, level };
}

async function loadEnglandWalesRandomQueries(limit: number): Promise<string[]> {
  const path = resolvePath(process.cwd(), "data", "territory-seed-candidates.uk.json");
  const payload = await readFile(path, "utf8");
  const rows = JSON.parse(payload) as Array<{ name?: string; territory?: string }>;
  const names = rows
    .filter((row) => row.territory === "england_wales")
    .map((row) => String(row.name ?? "").trim())
    .filter(Boolean);
  return sample(names, limit);
}

async function runQuery(provider: UkGolfApiProvider, query: string): Promise<QueryOutcome | null> {
  const clubs = await provider.searchClubs(query);
  if (clubs.length === 0) return null;
  const club = clubs[0]!;
  const courses = await provider.getClubCourses(club.id);
  if (courses.length === 0) return null;
  const course = courses[0]!;
  const discoveredTeeSets = await provider.discoverCourseTeeSets(course.id);
  const fallbackDiscoveryCalls = provider.getAndResetFallbackDiscoveryCalls();
  const courseDetail = await provider.getCourseDetail(course.id).catch(() => null);
  const detailTees = courseDetail?.tees ?? [];
  const fallbackScorecard = detailTees.length === 0 ? await provider.getCourseScorecard(course.id) : null;
  const fallbackTees = fallbackScorecard?.tees ?? [];
  const sourceTees = detailTees.length > 0 ? detailTees : fallbackTees;

  const fetchedTeeCandidates = sourceTees.map((returned) => {
    const checksum = createHash("sha256")
      .update(
        JSON.stringify({
          holes: returned?.holes ?? [],
          courseRating: returned?.courseRating ?? null,
          slopeRating: returned?.slopeRating ?? null,
          totalYardage: returned?.totalYardage ?? null,
        }),
      )
      .digest("hex");
    const requested =
      discoveredTeeSets.find((d) => (d.id ?? "").length > 0 && d.id === (returned.providerTeeSetId ?? "")) ??
      discoveredTeeSets.find((d) => d.label.toLowerCase() === (returned.teeName ?? "").toLowerCase()) ??
      null;
    return {
      requestedTeeSetId: requested?.id ?? returned.providerTeeSetId ?? null,
      requestedTeeLabel: requested?.label ?? returned.teeName ?? "Default",
      returnedTeeSet: returned?.teeName ?? null,
      checksum,
    };
  });

  const distinctChecksums = new Set(fetchedTeeCandidates.map((x) => x.checksum));
  const requestedDistinct = new Set(
    fetchedTeeCandidates
      .map((x) => x.requestedTeeLabel.trim().toLowerCase())
      .filter(Boolean),
  );
  const returnedDistinct = new Set(
    fetchedTeeCandidates
      .map((x) => (x.returnedTeeSet ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const perTeeFetchSupported = detailTees.length > 1 || distinctChecksums.size > 1 || returnedDistinct.size > 1;
  const warnings: string[] = [];
  if (requestedDistinct.size > 1 && !perTeeFetchSupported) {
    warnings.push(
      "Provider discovered multiple tee sets but scorecard endpoint returned the same tee for each request.",
    );
  }

  // Collapse duplicates: only keep one tee candidate per unique scorecard checksum.
  const checksumFirstSeen = new Set<string>();
  const aggregatedTeesRaw = sourceTees.map((tee) => ({
      ...tee,
      providerTeeSetId: tee.providerTeeSetId ?? null,
      __checksum: createHash("sha256")
        .update(
          JSON.stringify({
            holes: tee.holes,
            courseRating: tee.courseRating,
            slopeRating: tee.slopeRating,
            totalYardage: tee.totalYardage,
          }),
        )
        .digest("hex"),
    }));
  const aggregatedTees = sortUkTeesByPreferredOrder(
    aggregatedTeesRaw.filter((tee) => {
      if (checksumFirstSeen.has(tee.__checksum)) return false;
      checksumFirstSeen.add(tee.__checksum);
      return true;
    }).map(({ __checksum: _drop, ...rest }) => rest),
  );
  const scorecard = {
    courseId: course.id,
    tees: aggregatedTees,
    sourceUpdatedAt: fallbackScorecard?.sourceUpdatedAt ?? null,
    raw: courseDetail?.raw ?? fallbackScorecard?.raw ?? {},
  };
  const debugEmptyTees = process.env.UK_GOLF_DRY_DEBUG_EMPTY_TEES === "1";
  if (debugEmptyTees && scorecard.tees.length === 0) {
    const rawKeys = scorecard.raw && typeof scorecard.raw === "object" ? Object.keys(scorecard.raw) : [];
    console.log("[course-import:ukgolfapi:dry] empty tees debug", {
      query,
      clubId: club.id,
      courseId: course.id,
      courseName: course.name,
      rawKeys,
    });
  }
  const validations: TeeValidationResult[] = scorecard.tees.map((tee) => validateUkGolfTee(tee));
  const summary = summarizeUkGolfCompleteness(scorecard);
  const rawShapeSummary = summarizeRawShape(scorecard.raw);
  const parserShapeSuspect = summary.teesFound === 18 && summary.complete18TeeCount === 0;
  const dryRunStatus = classifyUkDryRunStatus(scorecard, validations);
  const tracking = deriveUkGolfSourceTracking(course.id, scorecard, validations);
  const preferredTees = sortUkTeesByPreferredOrder(scorecard.tees);
  const primaryTee = preferredTees[0] ?? null;
  const primaryValidation = validations[0] ?? null;
  const siPresentCount = primaryTee?.holes.filter((h) => h.strokeIndex != null).length ?? 0;
  const validationBreakdown = {
    missingSiCount: primaryTee ? primaryTee.holes.filter((h) => h.strokeIndex == null).length : 0,
    duplicateSiCount: primaryValidation?.issues.filter((i) => i.code === "SI_DUPLICATE").length ?? 0,
    siOutOfRangeCount: primaryValidation?.issues.filter((i) => i.code === "SI_RANGE").length ?? 0,
    missingParCount: primaryValidation?.issues.filter((i) => i.code === "PAR_MISSING").length ?? 0,
    missingYardageCount: primaryValidation?.issues.filter((i) => i.code === "YARDAGE_MISSING").length ?? 0,
    parMismatchCount: primaryValidation?.issues.filter((i) => i.code === "PAR_TOTAL_MISMATCH").length ?? 0,
    yardageMismatchCount: primaryValidation?.issues.filter((i) => i.code === "YARDAGE_TOTAL_MISMATCH").length ?? 0,
  };
  const teeCandidates = scorecard.tees.map((tee, idx) => {
    const v = validations[idx];
    const status = classifyUkDryRunStatus({ ...scorecard, tees: [tee] }, v ? [v] : undefined);
    return {
      providerTeeSetId: tee.providerTeeSetId ?? null,
      teeSet: tee.teeName,
      teeColour: tee.teeColour,
      teeGender: tee.gender,
      courseRating: tee.courseRating ?? null,
      slopeRating: tee.slopeRating ?? null,
      parTotal: tee.parTotal ?? null,
      totalYardage: tee.totalYardage ?? null,
      holes: tee.holes.map((h) => ({
        holeNumber: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
        strokeIndex: h.strokeIndex,
      })),
      dryRunStatus: status,
      verifiedForPlay: v?.isValid18 === true && tee.courseRating != null && tee.slopeRating != null,
      validationBreakdown: {
        missingSiCount: tee.holes.filter((h) => h.strokeIndex == null).length,
        duplicateSiCount: v?.issues.filter((i) => i.code === "SI_DUPLICATE").length ?? 0,
        siOutOfRangeCount: v?.issues.filter((i) => i.code === "SI_RANGE").length ?? 0,
        missingParCount: v?.issues.filter((i) => i.code === "PAR_MISSING").length ?? 0,
        missingYardageCount: v?.issues.filter((i) => i.code === "YARDAGE_MISSING").length ?? 0,
        parMismatchCount: v?.issues.filter((i) => i.code === "PAR_TOTAL_MISMATCH").length ?? 0,
        yardageMismatchCount: v?.issues.filter((i) => i.code === "YARDAGE_TOTAL_MISMATCH").length ?? 0,
      },
      warnings: [] as string[],
      canonicalTeeKey: canonicalTeeKey(tee.teeColour ?? null, tee.gender, tee.totalYardage ?? null),
    };
  });
  const courseWarnings = [...warnings];
  const nonStandardLabels = teeCandidates
    .filter((t) => isNonStandardTeeLabel(t.teeSet))
    .map((t) => t.teeSet)
    .filter((v): v is string => !!v);
  if (nonStandardLabels.length > 0) {
    courseWarnings.push(`non_standard_tee_label: ${[...new Set(nonStandardLabels)].join(", ")}`);
  }
  const redCount = teeCandidates.filter((t) => (t.teeColour ?? "").toLowerCase() === "red").length;
  if (redCount > 1) {
    courseWarnings.push("multiple_red_tees");
  }
  const winterCount = teeCandidates.filter((t) => /\bwinter\b/i.test(t.teeSet ?? "")).length;
  if (winterCount > 1) {
    courseWarnings.push("multiple_winter_tees");
  }
  const keyCounts = new Map<string, number>();
  for (const t of teeCandidates) {
    keyCounts.set(t.canonicalTeeKey, (keyCounts.get(t.canonicalTeeKey) ?? 0) + 1);
  }
  for (const t of teeCandidates) {
    if ((keyCounts.get(t.canonicalTeeKey) ?? 0) > 1) {
      t.warnings.push("possible_duplicate_tee_variant");
    }
  }
  const defaultPlayableTee = pickDefaultTees(teeCandidates);
  const primaryTeePerColour = pickPrimaryTeePerColour(
    teeCandidates.map((t) => ({
      teeSet: t.teeSet,
      teeColour: t.teeColour,
      providerTeeSetId: t.providerTeeSetId,
      totalYardage: t.totalYardage,
    })),
  );
  const courseTrust = computeCourseTrust(
    teeCandidates.map((t) => ({
      dryRunStatus: t.dryRunStatus,
      warnings: t.warnings,
      holes: t.holes.map((h) => ({ strokeIndex: h.strokeIndex })),
    })),
    courseWarnings,
  );

  // Ensure we can normalize into the import model shape.
  void toNormalizedCourseImportFromUkGolf({ club, course, scorecard });

  let golfApiFound = false;
  let golfApiScore = 0;
  let golfApiTees = 0;
  let golfApiTeesWithRatingSlope = 0;
  let golfApiTeesWithCompleteSi = 0;
  let bestGolfCandidate: MergeCourseData | null = null;
  try {
    const searchVariants = [...new Set([
      `${club.name} ${course.name}`,
      course.name,
      club.name,
      `${course.name} ${club.county ?? ""}`.trim(),
      `${club.name} ${club.postcode ?? ""}`.trim(),
    ])].filter((q) => q.length > 0);

    const candidateHits = new Map<number, { id: number; name: string; club_name?: string; location?: string }>();
    for (const searchQuery of searchVariants) {
      const hits = await searchCourses(searchQuery);
      for (const hit of hits) {
        if (Number.isFinite(Number(hit.id))) {
          candidateHits.set(Number(hit.id), hit);
        }
      }
    }

    const rankedHits = [...candidateHits.values()]
      .map((hit) => ({
        hit,
        score: rankGolfApiHit(hit, club.name, course.name, club.county, club.postcode),
      }))
      .sort((a, b) => b.score - a.score);

    const best = rankedHits[0];
    if (best && best.score >= 0.25 && Number.isFinite(Number(best.hit.id))) {
      const detail = await getCourseById(Number(best.hit.id));
      const normalized = normalizeGolfCourseApiCourse(detail);
      const m = golfApiCompleteness(normalized);
      golfApiFound = true;
      golfApiScore = m.score;
      golfApiTees = m.teesFound;
      golfApiTeesWithRatingSlope = m.teesWithRatingSlope;
      golfApiTeesWithCompleteSi = m.teesWithCompleteSi;
      const primary = normalized.tees[0];
      if (primary) {
        const base = {
          source: "golfcourseapi" as const,
          teeSet: primary.tee.teeName ?? null,
          holes: primary.holes,
          courseRating: primary.tee.courseRating ?? null,
          slopeRating: primary.tee.slopeRating ?? null,
          parTotal: primary.tee.parTotal ?? null,
          totalYardage: primary.tee.totalYards ?? null,
        };
        const completeness = computeCompleteness(base);
        bestGolfCandidate = {
          ...base,
          completeness,
          verifiedForPlay: computeVerifiedForPlay(completeness),
        };
      }
    }
  } catch {
    // Keep report resilient even when GolfCourseAPI misses a venue.
  }

  const ukScore = completenessScore({
    teesFound: summary.teesFound,
    teesWithRatingSlope: summary.teesWithRatingSlope,
    teesWithCompleteSi: summary.teesWithCompleteSi,
    valid18TeeCount: summary.valid18TeeCount,
    validationFailures: summary.failedValidationCount,
  });
  const comparison: QueryOutcome["comparison"] = !golfApiFound
    ? "unknown"
    : ukScore > golfApiScore
      ? "uk_better"
      : golfApiScore > ukScore
        ? "golf_api_better"
        : "tie";

  const reason =
    comparison === "unknown"
      ? "No matching GolfCourseAPI course found for comparison"
      : `uk_score=${ukScore} vs golf_api_score=${golfApiScore}`;

  const ukBase = primaryTee
    ? {
        source: "uk_golf_api" as const,
        teeSet: primaryTee.teeName ?? null,
        holes: primaryTee.holes,
        courseRating: primaryTee.courseRating ?? null,
        slopeRating: primaryTee.slopeRating ?? null,
        parTotal: primaryTee.parTotal ?? null,
        totalYardage: primaryTee.totalYardage ?? null,
      }
    : null;
  const ukCandidate: MergeCourseData | null = ukBase
    ? {
        ...ukBase,
        completeness: computeCompleteness(ukBase),
        verifiedForPlay: computeVerifiedForPlay(computeCompleteness(ukBase)),
      }
    : null;

  const mergedDecision = mergeCourseData(
    bestGolfCandidate, // dry-run proxy for "existing"
    ukCandidate,
    bestGolfCandidate,
  );
  const merged = mergedDecision.merged;
  const verifiedForPlay = merged?.verifiedForPlay ?? false;

  return {
    query,
    courseName: `${club.name} — ${course.name}`,
    uk: summary,
    ukValidationIssues: validations.reduce((sum, v) => sum + v.issues.length, 0),
    tracking,
    golfApi: {
      found: golfApiFound,
      completenessScore: golfApiScore,
      teesFound: golfApiTees,
      teesWithRatingSlope: golfApiTeesWithRatingSlope,
      teesWithCompleteSi: golfApiTeesWithCompleteSi,
    },
    comparison,
    reason,
    parserShapeSuspect,
    rawShapeSummary,
    dryRunStatus,
    ukTeeSnapshot: {
      teeSet: primaryTee?.teeName ?? null,
      courseRating: primaryTee?.courseRating ?? null,
      slopeRating: primaryTee?.slopeRating ?? null,
      parTotal: primaryTee?.parTotal ?? null,
      totalYardage: primaryTee?.totalYardage ?? null,
      siCompleteness: primaryTee
        ? `${siPresentCount}/${primaryTee.holes.length}`
        : "0/0",
      first3Holes: (primaryTee?.holes ?? []).slice(0, 3).map((h) => ({
        holeNumber: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
        strokeIndex: h.strokeIndex,
      })),
    },
    validationBreakdown,
    verifiedForPlay,
    providerCourseId: course.id,
    providerClubId: club.id,
    matchedClubName: club.name,
    matchedCourseName: course.name,
    rawJsonChecksum: createHash("sha256").update(JSON.stringify(scorecard.raw)).digest("hex"),
    fullHoles: (primaryTee?.holes ?? []).map((h) => ({
      holeNumber: h.holeNumber,
      par: h.par,
      yardage: h.yardage,
      strokeIndex: h.strokeIndex,
    })),
    discoveredTeeSets,
    fetchedTeeCandidates,
    perTeeFetchSupported,
    warnings,
    courseWarnings,
    fallbackDiscoveryCalls,
    defaultPlayableTee,
    primaryTeePerColour,
    courseTrustScore: courseTrust.score,
    courseTrustLevel: courseTrust.level,
    teeCandidates,
    promotion: {
      candidateSource: mergedDecision.candidateSource,
      promotionCandidate: mergedDecision.promotionCandidate && dryRunStatus === "verified_candidate",
      upgradeReason:
        mergedDecision.promotionCandidate && dryRunStatus === "verified_candidate"
          ? mergedDecision.upgradeReason
          : null,
    },
  };
}

async function stageUkGolfCandidates(rows: StagingCandidate[]): Promise<void> {
  const allowWrites = (process.env.UK_GOLF_API_ALLOW_STAGING_WRITES ?? "").toLowerCase() === "true";
  if (!allowWrites) {
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("UK_GOLF_API_ALLOW_STAGING_WRITES=true requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const row of rows) {
    const { data: courseRow, error: courseErr } = await supabase
      .from("uk_golf_api_course_candidates")
      .upsert(
        {
          provider_course_id: row.providerCourseId,
          provider_club_id: row.providerClubId,
          query: row.query,
          matched_club_name: row.matchedClubName,
          matched_course_name: row.matchedCourseName,
          validation_status: row.dryRunStatus,
          verified_for_play: row.verifiedForPlay,
          raw_json_checksum: row.rawJsonChecksum,
          imported_at: new Date().toISOString(),
        },
        { onConflict: "provider_course_id" },
      )
      .select("id")
      .single();
    if (courseErr) throw new Error(courseErr.message || "Failed to stage UK course candidate");
    if (!courseRow?.id) throw new Error("Failed to resolve staged UK course candidate id");

    for (const tee of row.tees) {
      if (!(tee.validationStatus === "verified_candidate" && tee.verifiedForPlay)) {
        continue;
      }
      const { data: teeRow, error: teeErr } = await supabase
        .from("uk_golf_api_tee_candidates")
        .upsert(
          {
            course_candidate_id: courseRow.id,
            provider_tee_set_id: tee.providerTeeSetId,
            tee_set: tee.teeSet,
            tee_colour: tee.teeColour,
            tee_gender: tee.teeGender,
            course_rating: tee.courseRating,
            slope_rating: tee.slopeRating,
            par_total: tee.parTotal,
            total_yardage: tee.totalYardage,
            validation_status: tee.validationStatus,
            verified_for_play: tee.verifiedForPlay,
            validation_summary: tee.validationSummary,
            raw_json_checksum: tee.rawJsonChecksum,
            review_notes: tee.reviewNotes,
            review_status: "pending",
            imported_at: new Date().toISOString(),
          },
          { onConflict: "course_candidate_id,provider_tee_set_id" },
        )
        .select("id")
        .single();
      if (teeErr) throw new Error(teeErr.message || "Failed to stage UK tee candidate");
      if (!teeRow?.id) throw new Error("Failed to resolve staged UK tee candidate id");

      const holeRows = tee.holes.map((h) => ({
        tee_candidate_id: teeRow.id,
        hole_number: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
        stroke_index: h.strokeIndex,
        imported_at: new Date().toISOString(),
      }));
      const { error: holeErr } = await supabase
        .from("uk_golf_api_hole_candidates")
        .upsert(holeRows, { onConflict: "tee_candidate_id,hole_number" });
      if (holeErr) throw new Error(holeErr.message || "Failed to stage UK hole candidates");
    }
  }
}

export async function runUkGolfApiDryRun(): Promise<{
  report: Record<string, unknown>;
  fallbackDiscoveryCalls: number;
}> {
  const rapidApiKey = resolveRapidApiKeyFromEnv();
  if (!rapidApiKey) {
    console.warn(
      "[course-import:ukgolfapi:dry] Missing RapidAPI key; skipping uk_golf_api dry run (set RAPIDAPI_KEY, GOLFCOURSE_API_KEY, EXPO_PUBLIC_GOLFCOURSE_API_KEY, or NEXT_PUBLIC_GOLF_API_KEY).",
    );
    return {
      report: {
        provider: "uk_golf_api",
        timestamp: new Date().toISOString(),
        skipped: true,
        skipReason: "missing_rapidapi_key",
      },
      fallbackDiscoveryCalls: 0,
    };
  }

  const provider = new UkGolfApiProvider();
  provider.assertConfigured();

  const randomCountRaw = Number(process.env.UK_GOLF_DRY_RANDOM_COUNT ?? 15);
  const randomCount = Number.isFinite(randomCountRaw) && randomCountRaw >= 0 ? Math.round(randomCountRaw) : 15;
  const interQueryDelayRaw = Number(process.env.UK_GOLF_DRY_DELAY_MS ?? 6000);
  const interQueryDelayMs =
    Number.isFinite(interQueryDelayRaw) && interQueryDelayRaw >= 0 ? Math.round(interQueryDelayRaw) : 4500;

  const seededQueries = ["Upavon", "Vale Resort", "Celtic Manor", "Woodhall Spa", "Swindon", "Wiltshire"];
  const randomQueries = await loadEnglandWalesRandomQueries(randomCount);
  const queries = [...new Set([...seededQueries, ...randomQueries])];

  const outcomes: QueryOutcome[] = [];
  const failures: Array<{ query: string; error: string }> = [];
  for (const query of queries) {
    try {
      const outcome = await runQuery(provider, query);
      if (outcome) outcomes.push(outcome);
      else failures.push({ query, error: "No clubs/courses found via UK Golf API" });
    } catch (error) {
      failures.push({ query, error: error instanceof Error ? error.message : String(error) });
    }
    if (interQueryDelayMs > 0) {
      await sleep(interQueryDelayMs);
    }
  }

  const totals = outcomes.reduce(
    (acc, row) => {
      acc.coursesFound += 1;
      acc.teesFound += row.uk.teesFound;
      acc.teesWithRatingSlope += row.uk.teesWithRatingSlope;
      acc.teesWithCompleteSi += row.uk.teesWithCompleteSi;
      acc.validationFailures += row.uk.failedValidationCount;
      if (row.parserShapeSuspect) acc.parserShapeSuspectCount += 1;
      if (row.dryRunStatus === "verified_candidate") acc.verifiedCandidateCount += 1;
      if (row.dryRunStatus === "partial") acc.partialCount += 1;
      if (row.dryRunStatus === "unverified") acc.unverifiedCount += 1;
      for (const tee of row.teeCandidates) {
        acc.totalTees += 1;
        if (tee.dryRunStatus === "verified_candidate") acc.verifiedTeeCount += 1;
        else if (tee.dryRunStatus === "partial") acc.partialTeeCount += 1;
        else acc.unverifiedTeeCount += 1;
      }
      acc.warningCount += row.courseWarnings.length;
      acc.warningCount += row.teeCandidates.reduce((s, t) => s + t.warnings.length, 0);
      acc.fallbackDiscoveryCalls += row.fallbackDiscoveryCalls;
      if (row.comparison === "uk_better") acc.ukBetter.push({ course: row.courseName, reason: row.reason });
      if (row.comparison === "golf_api_better") acc.golfApiBetter.push({ course: row.courseName, reason: row.reason });
      for (const tee of row.teeCandidates) {
        if (tee.dryRunStatus !== "verified_candidate") continue;
        acc.promotionCandidates.push({
          query: row.query,
          courseName: row.courseName,
          providerTeeSetId: tee.providerTeeSetId,
          teeSet: tee.teeSet,
          candidateSource: "uk_golf_api" as const,
          upgradeReason: "better_data_quality" as const,
          verifiedForPlay: tee.verifiedForPlay,
        });
      }
      return acc;
    },
    {
      coursesFound: 0,
      teesFound: 0,
      teesWithRatingSlope: 0,
      teesWithCompleteSi: 0,
      validationFailures: 0,
      parserShapeSuspectCount: 0,
      verifiedCandidateCount: 0,
      partialCount: 0,
      unverifiedCount: 0,
      totalTees: 0,
      verifiedTeeCount: 0,
      partialTeeCount: 0,
      unverifiedTeeCount: 0,
      warningCount: 0,
      fallbackDiscoveryCalls: 0,
      promotionCandidates: [] as Array<{
        query: string;
        courseName: string;
        providerTeeSetId: string | null;
        teeSet: string | null;
        candidateSource: "primary_verified" | "golfcourseapi" | "uk_golf_api" | null;
        upgradeReason: "adds_stroke_index" | "adds_rating_slope" | "fixes_incomplete_holes" | "better_data_quality";
        verifiedForPlay: boolean;
      }>,
      ukBetter: [] as Array<{ course: string; reason: string }>,
      golfApiBetter: [] as Array<{ course: string; reason: string }>,
    },
  );

  const celticRow =
    outcomes.find((row) => row.query.toLowerCase().includes("celtic manor")) ?? null;

  const stagingRows: StagingCandidate[] = outcomes.map((row) => {
    const primary = row.ukTeeSnapshot;
    const normalized = primary.teeSet ? normalizeUkTeeLabel(primary.teeSet) : null;
    return {
      query: row.query,
      providerCourseId: row.providerCourseId,
      providerClubId: row.providerClubId,
      matchedClubName: row.matchedClubName,
      matchedCourseName: row.matchedCourseName,
      dryRunStatus: row.dryRunStatus,
      verifiedForPlay: row.verifiedForPlay,
      rawJsonChecksum: row.rawJsonChecksum,
      tees: row.teeCandidates.map((tee) => {
        const normalizedTee = normalizeUkTeeLabel(tee.teeSet ?? undefined);
        const reviewNotes = isNonStandardTeeLabel(tee.teeSet) ? "non_standard_tee_label" : null;
        const teeChecksum = createHash("sha256")
          .update(
            JSON.stringify({
              teeSet: tee.teeSet,
              holes: tee.holes,
              courseRating: tee.courseRating,
              slopeRating: tee.slopeRating,
              totalYardage: tee.totalYardage,
            }),
          )
          .digest("hex");
        return {
          providerTeeSetId:
            tee.providerTeeSetId ??
            `${(normalizedTee.teeSet ?? tee.teeSet ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${tee.totalYardage ?? 0}`,
          teeSet: normalizedTee.teeSet ?? tee.teeSet,
          teeColour: normalizedTee.teeColour,
          teeGender: normalizedTee.gender,
          courseRating: tee.courseRating,
          slopeRating: tee.slopeRating,
          parTotal: tee.parTotal,
          totalYardage: tee.totalYardage,
          validationStatus: tee.dryRunStatus,
          verifiedForPlay: tee.verifiedForPlay,
          reviewNotes,
          validationSummary: tee.validationBreakdown,
          rawJsonChecksum: teeChecksum,
          holes: tee.holes,
        };
      }),
    };
  });
  await stageUkGolfCandidates(stagingRows);

  const report: Record<string, unknown> = {
    provider: "uk_golf_api",
    timestamp: new Date().toISOString(),
    testedQueries: queries.length,
    successfulQueries: outcomes.length,
    failedQueries: failures.length,
    coursesFound: totals.coursesFound,
    teesFound: totals.teesFound,
    teesWithRatingSlope: totals.teesWithRatingSlope,
    teesWithCompleteSI: totals.teesWithCompleteSi,
    validationFailures: totals.validationFailures,
    parserShapeSuspectCount: totals.parserShapeSuspectCount,
    headline: {
      verifiedCourses: `${totals.verifiedCandidateCount}/${outcomes.length}`,
      verifiedTees: `${totals.verifiedTeeCount}/${totals.totalTees}`,
      partialCourses: `${totals.partialCount}/${outcomes.length}`,
      partialTees: `${totals.partialTeeCount}/${totals.totalTees}`,
      rejectedCourses: `${totals.unverifiedCount}/${outcomes.length}`,
      rejectedTees: `${totals.unverifiedTeeCount}/${totals.totalTees}`,
    },
    statusCounts: {
      verifiedCandidate: totals.verifiedCandidateCount,
      partial: totals.partialCount,
      unverified: totals.unverifiedCount,
    },
    celticManorValidationDetail: celticRow
      ? {
          query: celticRow.query,
          courseName: celticRow.courseName,
          dryRunStatus: celticRow.dryRunStatus,
          validationBreakdown: celticRow.validationBreakdown,
        }
      : null,
    stagingWrites: {
      enabled: (process.env.UK_GOLF_API_ALLOW_STAGING_WRITES ?? "").toLowerCase() === "true",
      targetTables: [
        "uk_golf_api_course_candidates",
        "uk_golf_api_tee_candidates",
        "uk_golf_api_hole_candidates",
      ],
      stagedCourseCount: stagingRows.length,
    },
    fallbackDiscoveryCalls: totals.fallbackDiscoveryCalls,
    promotionCandidates: totals.promotionCandidates,
    coursePromotionSummary: outcomes
      .filter((o) => o.teeCandidates.some((t) => t.dryRunStatus === "verified_candidate"))
      .map((o) => ({
        query: o.query,
        courseName: o.courseName,
        verifiedTeeCount: o.teeCandidates.filter((t) => t.dryRunStatus === "verified_candidate").length,
        defaultPlayableTee: o.defaultPlayableTee,
        primaryTeePerColour: o.primaryTeePerColour,
        courseTrustScore: o.courseTrustScore,
        courseTrustLevel: o.courseTrustLevel,
      })),
    stagingWritePreview: stagingRows
      .flatMap((c) =>
        c.tees
          .filter((t) => t.validationStatus === "verified_candidate" && t.verifiedForPlay)
          .map((t) => ({
            courseName: c.matchedCourseName,
            providerCourseId: c.providerCourseId,
            teeSet: t.teeSet,
            teeColour: t.teeColour,
            teeGender: t.teeGender,
            courseRating: t.courseRating,
            slopeRating: t.slopeRating,
            parTotal: t.parTotal,
            totalYardage: t.totalYardage,
            holeCount: t.holes.length,
            warnings: t.reviewNotes ? [t.reviewNotes] : [],
            checksum: t.rawJsonChecksum,
          })),
      )
      .slice(0, 10),
    readyForStagingImport: {
      courseCount: outcomes.filter((o) => o.teeCandidates.some((t) => t.dryRunStatus === "verified_candidate")).length,
      teeCount: outcomes.reduce((sum, o) => sum + o.teeCandidates.filter((t) => t.dryRunStatus === "verified_candidate").length, 0),
      holeRowsCount: outcomes.reduce(
        (sum, o) =>
          sum +
          o.teeCandidates
            .filter((t) => t.dryRunStatus === "verified_candidate")
            .reduce((inner, t) => inner + t.holes.length, 0),
        0,
      ),
      warningsCount: totals.warningCount,
      rejectedCount: totals.unverifiedCount,
    },
    coursesBetterThanGolfCourseApi: totals.ukBetter,
    coursesWhereGolfCourseApiIsBetter: totals.golfApiBetter,
    failures,
    samples: outcomes.slice(0, 25),
  };

  const requestSummary = provider.getAndResetRequestSummary();
  console.log("[uk-golf-api] request-summary", requestSummary);
  report.requestSummary = requestSummary;

  return {
    report,
    fallbackDiscoveryCalls: totals.fallbackDiscoveryCalls,
  };
}

async function main(): Promise<void> {
  const { report } = await runUkGolfApiDryRun();
  console.log("[course-import:ukgolfapi:dry] report");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("[course-import:ukgolfapi:dry] fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
