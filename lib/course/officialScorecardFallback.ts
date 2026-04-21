import type { NormalizedHole } from "@/types/course";

type ScorecardFallbackSpec = {
  sourceType: "official_web" | "official_pdf" | "trusted_third_party";
  sourceUrl: string;
  strokeIndexByHole: Record<number, number>;
  teeNames?: string[];
};

const UPAVON_STROKE_INDEX: Record<number, number> = {
  1: 13,
  2: 9,
  3: 3,
  4: 1,
  5: 17,
  6: 5,
  7: 11,
  8: 7,
  9: 15,
  10: 4,
  11: 14,
  12: 18,
  13: 2,
  14: 8,
  15: 16,
  16: 6,
  17: 12,
  18: 10,
};

/** Curated fallbacks only when API payload lacks SI fields. */
const FALLBACKS_BY_API_ID: Record<number, ScorecardFallbackSpec> = {
  12241: {
    // Upavon official page is hosted via IntelligentGolf and links out to latest scorecard.
    // SI values validated against multiple independent scorecard mirrors.
    sourceType: "trusted_third_party",
    sourceUrl: "https://18birdies.com/golf-courses/club/c695cb00-86ac-11e4-8c28-020000005b00/upavon-golf-club",
    strokeIndexByHole: UPAVON_STROKE_INDEX,
    teeNames: ["white", "yellow", "red"],
  },
};

function normalizeTeeName(name: string): string {
  return name.trim().toLowerCase().replace(/\(ladies\)/g, "").trim();
}

export function applyOfficialScorecardFallback(params: {
  apiId: number;
  teeName: string;
  holes: NormalizedHole[];
}): {
  holes: NormalizedHole[];
  applied: boolean;
  sourceType?: ScorecardFallbackSpec["sourceType"];
  sourceUrl?: string;
} {
  const fallback = FALLBACKS_BY_API_ID[params.apiId];
  if (!fallback) return { holes: params.holes, applied: false };

  const normalizedTee = normalizeTeeName(params.teeName);
  if (fallback.teeNames && !fallback.teeNames.includes(normalizedTee)) {
    return { holes: params.holes, applied: false };
  }

  const hasAllSi = params.holes.every(
    (h) => Number.isFinite(Number(h.strokeIndex)) && Number(h.strokeIndex) >= 1 && Number(h.strokeIndex) <= 18,
  );
  if (hasAllSi) return { holes: params.holes, applied: false };

  const holeCount = params.holes.length;
  if (holeCount !== 18) return { holes: params.holes, applied: false };

  const patched = params.holes.map((h) => {
    const fallbackSi = fallback.strokeIndexByHole[h.holeNumber];
    const nextSi =
      Number.isFinite(Number(h.strokeIndex)) && Number(h.strokeIndex) >= 1 && Number(h.strokeIndex) <= 18
        ? h.strokeIndex
        : Number.isFinite(Number(fallbackSi))
          ? Number(fallbackSi)
          : null;
    return { ...h, strokeIndex: nextSi };
  });

  return {
    holes: patched,
    applied: true,
    sourceType: fallback.sourceType,
    sourceUrl: fallback.sourceUrl,
  };
}
