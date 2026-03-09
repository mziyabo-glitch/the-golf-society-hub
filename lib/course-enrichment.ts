import { normalizeCourseText, normalizeGender, normalizeTeeColor } from "./course-normalize";
import { scoreCourseMatch, type MatchScoreBreakdown } from "./course-match-score";

export type SeedCourse = {
  id: string;
  name: string;
  area?: string | null;
  lat: number;
  lng: number;
  normalized_name?: string | null;
};

export type CandidateTee = {
  tee_name: string;
  tee_color?: string | null;
  gender?: string | null;
  par?: number | null;
  course_rating?: number | null;
  slope_rating?: number | null;
  source?: string | null;
  source_ref?: string | null;
};

export type CandidateCourse = {
  name: string;
  area?: string | null;
  lat: number;
  lng: number;
  source: string;
  source_ref?: string | null;
  payload?: unknown;
  tees?: CandidateTee[];
};

export type CourseMatchCandidate = {
  candidate: CandidateCourse;
  score: MatchScoreBreakdown;
};

export type EnrichmentStatus = "matched" | "needs_review" | "skipped";

export type EnrichmentDecision = {
  status: EnrichmentStatus;
  confidence: number | null;
  matchedName: string | null;
  matchedSource: string | null;
  proposedTees: CandidateTee[];
  bestCandidate: CourseMatchCandidate | null;
  candidateSummary: {
    name: string;
    area: string | null;
    source: string;
    confidence: number;
    distanceKm: number;
  }[];
  notes: string[];
  payload: Record<string, unknown>;
};

export const MATCH_CONFIDENCE_HIGH = 0.86;
export const MATCH_CONFIDENCE_REVIEW = 0.68;

function normalizedSeed(seed: SeedCourse): SeedCourse {
  return {
    ...seed,
    normalized_name: seed.normalized_name || normalizeCourseText(seed.name),
  };
}

function sanitizeTee(tee: CandidateTee, fallbackSource: string): CandidateTee {
  const teeName = tee.tee_name?.trim() || "Unknown Tee";
  return {
    tee_name: teeName,
    tee_color: normalizeTeeColor(tee.tee_color),
    gender: normalizeGender(tee.gender),
    par: tee.par ?? null,
    course_rating: tee.course_rating ?? null,
    slope_rating: tee.slope_rating ?? null,
    source: tee.source ?? fallbackSource,
    source_ref: tee.source_ref ?? null,
  };
}

export function resolveCourseEnrichment(
  seedInput: SeedCourse,
  candidates: CandidateCourse[],
  options?: {
    highThreshold?: number;
    reviewThreshold?: number;
    maxCandidatesInPayload?: number;
  }
): EnrichmentDecision {
  const seed = normalizedSeed(seedInput);
  const highThreshold = options?.highThreshold ?? MATCH_CONFIDENCE_HIGH;
  const reviewThreshold = options?.reviewThreshold ?? MATCH_CONFIDENCE_REVIEW;
  const maxCandidatesInPayload = options?.maxCandidatesInPayload ?? 5;

  if (candidates.length === 0) {
    return {
      status: "skipped",
      confidence: null,
      matchedName: null,
      matchedSource: null,
      proposedTees: [],
      bestCandidate: null,
      candidateSummary: [],
      notes: ["No candidate rows were available for this course."],
      payload: { strategy: "seeded-course-enrichment", reason: "no_candidates" },
    };
  }

  const scored = candidates.map((candidate) => ({
    candidate,
    score: scoreCourseMatch({
      seedName: seed.name,
      seedArea: seed.area,
      seedLat: seed.lat,
      seedLng: seed.lng,
      candidateName: candidate.name,
      candidateArea: candidate.area,
      candidateLat: candidate.lat,
      candidateLng: candidate.lng,
    }),
  }));

  scored.sort((a, b) => b.score.confidence - a.score.confidence);
  const best = scored[0] ?? null;
  const bestConfidence = best?.score.confidence ?? 0;

  const candidateSummary = scored.slice(0, maxCandidatesInPayload).map(({ candidate, score }) => ({
    name: candidate.name,
    area: candidate.area ?? null,
    source: candidate.source,
    confidence: score.confidence,
    distanceKm: score.distanceKm,
  }));

  if (!best) {
    return {
      status: "skipped",
      confidence: null,
      matchedName: null,
      matchedSource: null,
      proposedTees: [],
      bestCandidate: null,
      candidateSummary,
      notes: ["Unable to score candidates."],
      payload: { strategy: "seeded-course-enrichment", reason: "no_best_candidate", candidateSummary },
    };
  }

  const notes: string[] = [];
  if (!best.score.eligible) {
    notes.push("Best candidate failed non-name evidence rule.");
  }
  notes.push(...best.score.reasons);

  const proposedTees = (best.candidate.tees ?? []).map((tee) =>
    sanitizeTee(tee, best.candidate.source)
  );

  const payload: Record<string, unknown> = {
    strategy: "seeded-course-enrichment",
    thresholds: { highThreshold, reviewThreshold },
    seed: {
      id: seed.id,
      name: seed.name,
      area: seed.area ?? null,
      lat: seed.lat,
      lng: seed.lng,
      normalized_name: seed.normalized_name ?? null,
    },
    bestCandidate: {
      name: best.candidate.name,
      area: best.candidate.area ?? null,
      source: best.candidate.source,
      source_ref: best.candidate.source_ref ?? null,
      confidence: best.score.confidence,
      distance_km: best.score.distanceKm,
      eligible: best.score.eligible,
      score: best.score,
      payload: best.candidate.payload ?? null,
      proposed_tees: proposedTees,
    },
    candidateSummary,
  };

  if (best.score.eligible && bestConfidence >= highThreshold) {
    return {
      status: "matched",
      confidence: bestConfidence,
      matchedName: best.candidate.name,
      matchedSource: best.candidate.source,
      proposedTees,
      bestCandidate: best,
      candidateSummary,
      notes,
      payload,
    };
  }

  if (bestConfidence >= reviewThreshold) {
    notes.push("Candidate confidence requires manual review.");
  } else {
    notes.push("Best candidate confidence below review threshold.");
  }

  return {
    status: "needs_review",
    confidence: bestConfidence,
    matchedName: best.candidate.name,
    matchedSource: best.candidate.source,
    proposedTees,
    bestCandidate: best,
    candidateSummary,
    notes,
    payload,
  };
}
