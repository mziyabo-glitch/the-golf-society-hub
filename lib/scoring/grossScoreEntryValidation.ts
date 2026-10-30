import type { EventHoleSnapshot } from "@/lib/scoring/eventScoringTypes";

const MIN_GROSS = 1;
const MAX_GROSS = 30;

/**
 * Validate gross entries against the immutable hole snapshot (partial or full round).
 * Returns human-readable issues (empty when valid).
 */
export function validateGrossScoresAgainstSnapshot(
  grossScoresByHole: Readonly<Record<number, number>>,
  snapshotHoles: readonly EventHoleSnapshot[],
): string[] {
  const issues: string[] = [];
  const allowed = new Set(snapshotHoles.map((h) => h.holeNumber));
  const keys = Object.keys(grossScoresByHole);
  if (keys.length === 0) {
    issues.push("At least one hole gross score is required.");
    return issues;
  }
  for (const k of keys) {
    const holeNumber = Number(k);
    if (!Number.isInteger(holeNumber) || !allowed.has(holeNumber)) {
      issues.push(`Invalid or unknown hole_number: ${k}`);
      continue;
    }
    const g = grossScoresByHole[holeNumber as keyof typeof grossScoresByHole];
    const n = typeof g === "number" ? g : Number(g);
    if (!Number.isInteger(n) || n < MIN_GROSS || n > MAX_GROSS) {
      issues.push(`Hole ${holeNumber}: gross_strokes must be an integer between ${MIN_GROSS} and ${MAX_GROSS}.`);
    }
  }
  return issues;
}

/**
 * Build a gross map for validation / save from per-hole text draft (empty cells omitted).
 * Only holes present on `snapshotHoles` are considered.
 */
export function grossScoresMapFromStringDraft(
  draft: Readonly<Record<number, string>>,
  snapshotHoles: readonly EventHoleSnapshot[],
): Record<number, number> {
  const allowed = new Set(snapshotHoles.map((h) => h.holeNumber));
  const out: Record<number, number> = {};
  for (const holeNumber of allowed) {
    const raw = String(draft[holeNumber] ?? "").trim();
    if (!raw) continue;
    const n = Math.round(Number(raw));
    if (Number.isInteger(n) && n >= MIN_GROSS && n <= MAX_GROSS) {
      out[holeNumber] = n;
    }
  }
  return out;
}
