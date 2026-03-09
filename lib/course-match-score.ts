import {
  haversineDistanceKm,
  jaccardSimilarity,
  normalizeCourseText,
  tokenizeNormalized,
} from "./course-normalize";

export type MatchScoreInput = {
  seedName: string;
  seedArea?: string | null;
  seedLat: number;
  seedLng: number;
  candidateName: string;
  candidateArea?: string | null;
  candidateLat: number;
  candidateLng: number;
};

export type MatchScoreBreakdown = {
  nameScore: number;
  areaScore: number;
  distanceKm: number;
  proximityScore: number;
  confidence: number;
  eligible: boolean;
  reasons: string[];
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function scoreDistance(distanceKm: number): number {
  if (!Number.isFinite(distanceKm)) return 0;
  if (distanceKm <= 0.75) return 1;
  if (distanceKm <= 2) return 0.94;
  if (distanceKm <= 5) return 0.8;
  if (distanceKm <= 10) return 0.62;
  if (distanceKm <= 20) return 0.35;
  return 0.08;
}

export function scoreCourseMatch(input: MatchScoreInput): MatchScoreBreakdown {
  const seedName = normalizeCourseText(input.seedName);
  const candidateName = normalizeCourseText(input.candidateName);
  const seedArea = normalizeCourseText(input.seedArea ?? "");
  const candidateArea = normalizeCourseText(input.candidateArea ?? "");

  const nameScore = jaccardSimilarity(tokenizeNormalized(seedName), tokenizeNormalized(candidateName));
  const areaScore = seedArea && candidateArea
    ? jaccardSimilarity(tokenizeNormalized(seedArea), tokenizeNormalized(candidateArea))
    : 0;

  const distanceKm = haversineDistanceKm(
    input.seedLat,
    input.seedLng,
    input.candidateLat,
    input.candidateLng
  );
  const proximityScore = scoreDistance(distanceKm);

  // Rule: never match on name alone.
  // Require a second signal: area overlap OR close geo proximity.
  const hasAreaEvidence = areaScore >= 0.34;
  const hasGeoEvidence = distanceKm <= 15;
  const eligible = hasAreaEvidence || hasGeoEvidence;

  const weighted = clamp01(
    nameScore * 0.52 +
      areaScore * 0.18 +
      proximityScore * 0.30
  );

  const reasons: string[] = [];
  if (!eligible) {
    reasons.push("Insufficient non-name evidence (area/proximity).");
  }
  if (distanceKm > 30) {
    reasons.push("Candidate is far from seeded coordinates.");
  }
  if (nameScore < 0.3) {
    reasons.push("Low name similarity.");
  }

  return {
    nameScore,
    areaScore,
    distanceKm,
    proximityScore,
    confidence: eligible ? weighted : Math.min(weighted, 0.5),
    eligible,
    reasons,
  };
}
