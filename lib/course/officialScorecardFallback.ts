import type { NormalizedHole } from "@/types/course";

export type OfficialScorecardSourceType = "official_scorecard_fallback";

export type OfficialFallbackTeeMetrics = {
  courseRating: number;
  parTotal: number;
  totalYards: number;
  slopeRating: null;
};

type OfficialFallbackHoleRow = {
  holeNumber: number;
  par: number;
  yardage: number;
  strokeIndex: number;
};

type OfficialFallbackTeeSpec = {
  teeKeys: string[];
  metrics: OfficialFallbackTeeMetrics;
  holes: OfficialFallbackHoleRow[];
};

type OfficialCourseFallbackSpec = {
  apiIds: number[];
  aliasKeys: string[];
  /** When false, only fill missing stroke indexes (legacy Upavon behaviour). */
  fullOverride: boolean;
  sourceType: OfficialScorecardSourceType;
  sourceUrl: string;
  dataConfidence: "verified";
  golferDataStatus: "verified_manual";
  tees: OfficialFallbackTeeSpec[];
};

const MEON_YELLOW_SI = [11, 1, 7, 15, 3, 13, 17, 5, 9, 4, 8, 14, 12, 10, 16, 2, 6, 18] as const;

function holeRows(rows: Array<[number, number, number, number]>): OfficialFallbackHoleRow[] {
  return rows.map(([holeNumber, yardage, par, strokeIndex]) => ({
    holeNumber,
    yardage,
    par,
    strokeIndex,
  }));
}

const MEON_VALLEY_MEON_COURSE: OfficialCourseFallbackSpec = {
  apiIds: [],
  aliasKeys: [
    "meon valley",
    "meon valley hotel country club",
    "meon valley hotel and country club",
    "meon course",
    "meon valley meon course",
  ],
  fullOverride: true,
  sourceType: "official_scorecard_fallback",
  sourceUrl: "https://www.britanniahotels.com/hotels/meon-valley-hotel-country-club",
  dataConfidence: "verified",
  golferDataStatus: "verified_manual",
  tees: [
    {
      teeKeys: ["white"],
      metrics: { courseRating: 72, parTotal: 71, totalYards: 6492, slopeRating: null },
      holes: holeRows([
        [1, 496, 5, 11],
        [2, 443, 4, 1],
        [3, 408, 4, 7],
        [4, 167, 3, 15],
        [5, 445, 4, 3],
        [6, 362, 4, 13],
        [7, 156, 3, 17],
        [8, 549, 5, 5],
        [9, 390, 4, 9],
        [10, 543, 5, 4],
        [11, 359, 4, 8],
        [12, 155, 3, 14],
        [13, 328, 4, 12],
        [14, 233, 3, 10],
        [15, 312, 4, 16],
        [16, 467, 4, 2],
        [17, 385, 4, 6],
        [18, 294, 4, 18],
      ]),
    },
    {
      teeKeys: ["yellow"],
      metrics: { courseRating: 70, parTotal: 71, totalYards: 6073, slopeRating: null },
      holes: holeRows([
        [1, 486, 5, 11],
        [2, 410, 4, 1],
        [3, 376, 4, 7],
        [4, 150, 3, 15],
        [5, 420, 4, 3],
        [6, 345, 4, 13],
        [7, 136, 3, 17],
        [8, 486, 5, 5],
        [9, 363, 4, 9],
        [10, 528, 5, 4],
        [11, 324, 4, 8],
        [12, 121, 3, 14],
        [13, 311, 4, 12],
        [14, 201, 3, 10],
        [15, 308, 4, 16],
        [16, 456, 4, 2],
        [17, 371, 4, 6],
        [18, 281, 4, 18],
      ]),
    },
    {
      teeKeys: ["red"],
      metrics: { courseRating: 73, parTotal: 73, totalYards: 5620, slopeRating: null },
      holes: holeRows([
        [1, 433, 5, 13],
        [2, 347, 4, 7],
        [3, 362, 4, 1],
        [4, 142, 3, 17],
        [5, 389, 5, 11],
        [6, 339, 4, 5],
        [7, 124, 3, 15],
        [8, 473, 5, 3],
        [9, 314, 4, 9],
        [10, 494, 5, 6],
        [11, 298, 4, 2],
        [12, 121, 3, 16],
        [13, 275, 4, 12],
        [14, 192, 3, 14],
        [15, 292, 4, 8],
        [16, 455, 5, 10],
        [17, 307, 4, 4],
        [18, 263, 4, 18],
      ]),
    },
  ],
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

const UPAVON_FALLBACK: OfficialCourseFallbackSpec = {
  apiIds: [12241],
  aliasKeys: ["upavon golf club", "upavon"],
  fullOverride: false,
  sourceType: "official_scorecard_fallback",
  sourceUrl: "https://18birdies.com/golf-courses/club/c695cb00-86ac-11e4-8c28-020000005b00/upavon-golf-club",
  dataConfidence: "verified",
  golferDataStatus: "verified_manual",
  tees: [
    {
      teeKeys: ["white", "yellow", "red"],
      metrics: { courseRating: 0, parTotal: 0, totalYards: 0, slopeRating: null },
      holes: Object.entries(UPAVON_STROKE_INDEX).map(([n, strokeIndex]) => ({
        holeNumber: Number(n),
        par: 4,
        yardage: 0,
        strokeIndex,
      })),
    },
  ],
};

const OFFICIAL_COURSE_FALLBACKS: OfficialCourseFallbackSpec[] = [MEON_VALLEY_MEON_COURSE, UPAVON_FALLBACK];

/** Normalized key for club/course alias matching (not identical to DB display keys). */
export function normalizeOfficialCourseMatchKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isMeonValleyNineHoleValleyCourse(combinedKey: string): boolean {
  return /\bvalley course\b/.test(combinedKey) && !/\bmeon course\b/.test(combinedKey);
}

export function resolveOfficialCourseFallback(params: {
  apiId?: number | null;
  clubName?: string | null;
  courseName?: string | null;
  fullName?: string | null;
}): OfficialCourseFallbackSpec | null {
  const apiId = params.apiId != null && Number.isFinite(Number(params.apiId)) ? Number(params.apiId) : null;
  const combinedKey = normalizeOfficialCourseMatchKey(
    [params.clubName, params.courseName, params.fullName].filter((x) => typeof x === "string" && x.trim()).join(" "),
  );
  if (!combinedKey) return null;

  for (const spec of OFFICIAL_COURSE_FALLBACKS) {
    if (apiId != null && spec.apiIds.includes(apiId)) return spec;
  }

  if (isMeonValleyNineHoleValleyCourse(combinedKey)) return null;

  for (const spec of OFFICIAL_COURSE_FALLBACKS) {
    if (spec.aliasKeys.some((alias) => combinedKey.includes(alias) || alias.includes(combinedKey))) {
      return spec;
    }
  }

  return null;
}

function normalizeTeeName(name: string): string {
  return name.trim().toLowerCase().replace(/\(ladies\)/g, "").trim();
}

function findOfficialTeeSpec(spec: OfficialCourseFallbackSpec, teeName: string): OfficialFallbackTeeSpec | null {
  const key = normalizeTeeName(teeName);
  return spec.tees.find((t) => t.teeKeys.includes(key)) ?? null;
}

function toNormalizedHoles(rows: OfficialFallbackHoleRow[]): NormalizedHole[] {
  return rows.map((h) => ({
    holeNumber: h.holeNumber,
    par: h.par,
    yardage: h.yardage,
    strokeIndex: h.strokeIndex,
  }));
}

function patchUpavonSiOnly(
  spec: OfficialCourseFallbackSpec,
  teeName: string,
  holes: NormalizedHole[],
): { holes: NormalizedHole[]; applied: boolean } {
  const teeSpec = findOfficialTeeSpec(spec, teeName);
  if (!teeSpec || holes.length !== 18) return { holes, applied: false };

  const siByHole = new Map(teeSpec.holes.map((h) => [h.holeNumber, h.strokeIndex]));
  const hasAllSi = holes.every(
    (h) => Number.isFinite(Number(h.strokeIndex)) && Number(h.strokeIndex) >= 1 && Number(h.strokeIndex) <= 18,
  );
  if (hasAllSi) return { holes, applied: false };

  const patched = holes.map((h) => {
    const fallbackSi = siByHole.get(h.holeNumber);
    const nextSi =
      Number.isFinite(Number(h.strokeIndex)) && Number(h.strokeIndex) >= 1 && Number(h.strokeIndex) <= 18
        ? h.strokeIndex
        : Number.isFinite(Number(fallbackSi))
          ? Number(fallbackSi)
          : null;
    return { ...h, strokeIndex: nextSi };
  });

  return { holes: patched, applied: true };
}

export function applyOfficialScorecardFallback(params: {
  apiId: number;
  teeName: string;
  holes: NormalizedHole[];
  clubName?: string | null;
  courseName?: string | null;
  fullName?: string | null;
}): {
  holes: NormalizedHole[];
  applied: boolean;
  fullOverride?: boolean;
  sourceType?: OfficialScorecardSourceType | "trusted_third_party";
  sourceUrl?: string;
  dataConfidence?: "verified";
  golferDataStatus?: "verified_manual";
  teeMetrics?: OfficialFallbackTeeMetrics;
} {
  const spec = resolveOfficialCourseFallback({
    apiId: params.apiId,
    clubName: params.clubName,
    courseName: params.courseName,
    fullName: params.fullName,
  });
  if (!spec) return { holes: params.holes, applied: false };

  const teeSpec = findOfficialTeeSpec(spec, params.teeName);
  if (!teeSpec) return { holes: params.holes, applied: false };

  if (!spec.fullOverride) {
    const partial = patchUpavonSiOnly(spec, params.teeName, params.holes);
    if (!partial.applied) return { holes: params.holes, applied: false };
    return {
      holes: partial.holes,
      applied: true,
      sourceType: "trusted_third_party",
      sourceUrl: spec.sourceUrl,
    };
  }

  return {
    holes: toNormalizedHoles(teeSpec.holes),
    applied: true,
    fullOverride: true,
    sourceType: spec.sourceType,
    sourceUrl: spec.sourceUrl,
    dataConfidence: spec.dataConfidence,
    golferDataStatus: spec.golferDataStatus,
    teeMetrics: teeSpec.metrics,
  };
}

export function getMeonValleyOfficialFallbackForTests(): OfficialCourseFallbackSpec {
  return MEON_VALLEY_MEON_COURSE;
}

export function getMeonValleyYellowSiSequence(): readonly number[] {
  return MEON_YELLOW_SI;
}
