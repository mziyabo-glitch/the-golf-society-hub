/**
 * Defensive normalization of GolfCourseAPI payloads → internal import shape.
 *
 * Scoring readiness (Stableford / net / gross):
 * - `NormalizedTee.courseRating`, `slopeRating`, `parTotal` feed Course Handicap → playing handicap.
 * - Per-hole `par`, `yardage`, `strokeIndex` feed hole-by-hole net Stableford and stroke indices for match play / comps.
 */

import type {
  GolfCourseApiCourse,
  GolfCourseApiHole,
  GolfCourseApiTee,
  GolfCourseApiTeeBuckets,
  NormalizedCourse,
  NormalizedCourseImport,
  NormalizedHole,
  NormalizedTee,
} from "@/types/course";
import { applyOfficialScorecardFallback } from "@/lib/course/officialScorecardFallback";

function isDevRuntime(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

function devLogShape(label: string, detail: unknown): void {
  if (!isDevRuntime()) return;
  console.warn(`[courseNormalizer] ${label}`, typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 800));
}

function safeFiniteNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeInt(v: unknown): number | null {
  const n = safeFiniteNumber(v);
  if (n == null) return null;
  return Math.round(n);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function locationParts(row: Record<string, unknown>): { address: string | null; city: string | null; country: string | null } {
  const pickStr = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
  let address = pickStr(row.address);
  const city = pickStr(row.city);
  const country = pickStr(row.country);
  const loc = row.location;
  if (!address && loc) {
    if (typeof loc === "string" && loc.trim()) address = loc.trim();
    else {
      const o = asRecord(loc);
      if (o) {
        const parts = [o.address, o.city, o.region, o.country].filter((x) => typeof x === "string" && (x as string).trim()) as string[];
        if (parts.length) address = parts.join(", ");
      }
    }
  }
  return { address, city, country };
}

function flattenTeesPayload(tees: GolfCourseApiCourse["tees"]): { group: "male" | "female" | "unisex"; tee: GolfCourseApiTee }[] {
  if (!tees) return [];
  if (Array.isArray(tees)) {
    return tees.map((tee) => ({ group: "unisex" as const, tee }));
  }
  const b = tees as GolfCourseApiTeeBuckets;
  const male = [...(b.male ?? b.men ?? [])].map((tee) => ({ group: "male" as const, tee }));
  const female = [...(b.female ?? b.women ?? b.ladies ?? [])].map((tee) => ({ group: "female" as const, tee }));
  return [...male, ...female];
}

function normalizeGender(g: unknown, group: "male" | "female" | "unisex"): "M" | "F" | null {
  if (group === "male") return "M";
  if (group === "female") return "F";
  if (g == null) return null;
  const s = String(g).toLowerCase();
  if (s.startsWith("f")) return "F";
  if (s.startsWith("m")) return "M";
  return null;
}

/**
 * Structural issues that affect scoring readiness (for tests and dev diagnostics).
 */
export function getTeeHoleCompletenessIssues(teeLabel: string, holes: NormalizedHole[]): string[] {
  const issues: string[] = [];
  if (holes.length === 0) return issues;
  const n = holes.length;
  if (n !== 9 && n !== 18) {
    issues.push(`tee "${teeLabel}": expected 9 or 18 holes for standard scoring, got ${n}`);
  }
  for (const h of holes) {
    if (h.par == null || h.yardage == null || h.strokeIndex == null) {
      issues.push(
        `tee "${teeLabel}" hole ${h.holeNumber}: missing par, yardage, or stroke_index (par=${h.par}, yardage=${h.yardage}, strokeIndex=${h.strokeIndex})`,
      );
    }
  }
  return issues;
}

export function logNormalizedCourseImportHoleWarnings(import_: NormalizedCourseImport): void {
  for (const { tee, holes } of import_.tees) {
    const issues = getTeeHoleCompletenessIssues(tee.teeName, holes);
    if (!isDevRuntime() || issues.length === 0) continue;
    for (const msg of issues) console.warn(`[courseNormalizer] ${msg}`);
  }
}

function normalizeHoles(raw: GolfCourseApiHole[] | undefined, teeLabel: string): NormalizedHole[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    devLogShape("missing or empty holes[]", { tee: teeLabel });
    return [];
  }
  const out: NormalizedHole[] = [];
  for (let i = 0; i < raw.length; i++) {
    const h = raw[i]!;
    const holeNumber =
      safeInt(h.hole_number ?? h.number) ?? (raw.length <= 18 && i + 1 <= 18 ? i + 1 : null);
    if (holeNumber == null || holeNumber < 1 || holeNumber > 18) {
      devLogShape("skip hole (bad number)", { tee: teeLabel, h });
      continue;
    }
    const par = safeInt(h.par);
    const yardage = safeInt(h.yardage ?? h.yards);
    const strokeIndex = safeInt(h.stroke_index ?? h.strokeIndex ?? h.handicap ?? h.hcp ?? h.si);
    out.push({ holeNumber, par, yardage, strokeIndex });
  }
  out.sort((a, b) => a.holeNumber - b.holeNumber);
  return out;
}

function disambiguateTeeName(base: string, used: Set<string>): string {
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    name = `${base} (${n})`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

/** Case-insensitive exact match on full tee name (after normalizer disambiguation). */
function pickDefaultTeeIndex(tees: NormalizedTee[]): number {
  if (tees.length === 0) return -1;
  const norm = (s: string) => s.trim().toLowerCase();
  const white = tees.findIndex((t) => norm(t.teeName) === "white");
  if (white >= 0) return white;
  const yellow = tees.findIndex((t) => norm(t.teeName) === "yellow");
  if (yellow >= 0) return yellow;
  let bestIdx = 0;
  let bestSlope = Infinity;
  for (let i = 0; i < tees.length; i++) {
    const s = tees[i]!.slopeRating;
    if (s != null && s > 0 && s < bestSlope) {
      bestSlope = s;
      bestIdx = i;
    }
  }
  if (bestSlope !== Infinity) return bestIdx;
  return 0;
}

/**
 * Build `full_name` and slug key for dedupe / search.
 */
export function normalizeGolfCourseApiCourse(api: GolfCourseApiCourse): NormalizedCourseImport {
  const row = api as Record<string, unknown>;
  const apiId = safeInt(api.id) ?? 0;
  if (!Number.isFinite(apiId) || apiId <= 0) {
    throw new Error("normalizeGolfCourseApiCourse: missing or invalid course id");
  }

  const clubName = (typeof api.club_name === "string" && api.club_name.trim()
    ? api.club_name
    : typeof api.club === "string" && api.club.trim()
      ? api.club
      : null) as string | null;

  const courseName = (
    (typeof api.name === "string" && api.name.trim() ? api.name : null) ||
    (typeof api.course_name === "string" && api.course_name.trim() ? api.course_name : null) ||
    clubName ||
    "Unknown course"
  ).trim();

  const fullName =
    clubName && courseName && clubName.trim() !== courseName.trim()
      ? `${clubName.trim()} — ${courseName.trim()}`
      : courseName;

  const lat = safeFiniteNumber(api.latitude ?? api.lat);
  const lng = safeFiniteNumber(api.longitude ?? api.lng);
  const { address, city, country } = locationParts(row);

  const normalizedNameKey = `${(clubName ?? "").toLowerCase()}|${courseName.toLowerCase()}`
    .replace(/[^a-z0-9|]+/gi, " ")
    .trim();

  const course: NormalizedCourse = {
    apiId,
    clubName: clubName?.trim() ?? null,
    courseName,
    fullName,
    address,
    city,
    country,
    latitude: lat,
    longitude: lng,
    dedupeKey: `golfcourseapi:${apiId}`,
    normalizedNameKey,
    source: "golfcourseapi",
  };

  const flat = flattenTeesPayload(api.tees);
  if (flat.length === 0) {
    devLogShape("no tees on course payload", { apiId });
  }

  const usedNames = new Set<string>();
  const teesOut: Array<{ tee: NormalizedTee; holes: NormalizedHole[] }> = [];

  let order = 0;

  for (const { group, tee } of flat) {
    const baseName = (tee.tee_name || tee.name || "").trim();
    if (!baseName) {
      devLogShape("skip tee with empty name", { group, tee });
      continue;
    }
    const gender = normalizeGender(tee.gender, group);
    let teeName = baseName;
    if (gender === "F" && !teeName.toLowerCase().includes("ladies")) {
      teeName = `${teeName} (Ladies)`;
    }
    teeName = disambiguateTeeName(teeName, usedNames);

    const courseRating = safeFiniteNumber(tee.course_rating);
    const bogeyRating = safeFiniteNumber(tee.bogey_rating);
    const slopeRating = safeInt(tee.slope_rating);
    const parTotal = safeInt(tee.par_total ?? tee.par);
    const totalYards = safeInt(tee.total_yards ?? tee.yards ?? tee.yardage);
    const totalMeters = safeInt(tee.total_meters ?? tee.meters);
    const teeColor = typeof tee.tee_color === "string" && tee.tee_color.trim() ? tee.tee_color.trim() : null;

    const holesRaw = normalizeHoles(tee.holes, teeName);
    const fallback = applyOfficialScorecardFallback({
      apiId,
      teeName,
      holes: holesRaw,
    });
    const holes = fallback.holes;
    if (isDevRuntime() && fallback.applied) {
      console.log("[courseNormalizer] applied SI fallback", {
        apiId,
        teeName,
        sourceType: fallback.sourceType,
        sourceUrl: fallback.sourceUrl,
      });
    }

    const normalizedTee: NormalizedTee = {
      teeName,
      gender,
      apiSourceGroup: group,
      courseRating,
      bogeyRating,
      slopeRating,
      parTotal,
      totalYards,
      totalMeters,
      teeColor,
      isDefault: false,
      displayOrder: order++,
      holes,
    };
    teesOut.push({ tee: normalizedTee, holes });
  }

  for (const x of teesOut) x.tee.isDefault = false;
  const defIdx = pickDefaultTeeIndex(teesOut.map((x) => x.tee));
  if (defIdx >= 0) teesOut[defIdx]!.tee.isDefault = true;

  return { course, tees: teesOut };
}
