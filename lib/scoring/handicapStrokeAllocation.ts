import type { EventHoleSnapshot } from "@/lib/scoring/eventScoringTypes";

/**
 * Shots received on each hole for a **non-negative integer playing handicap** `playingHandicapStrokes`.
 * Holes are ranked by `strokeIndex` ascending (1 = hardest). Extra strokes go to the hardest `remainder` holes.
 * Supports 9- or 18-hole cards (`holes.length`).
 *
 * Plus handicaps / fractional PH: caller should pass a rounded integer playing handicap suitable for the comp rules.
 */
export function buildStrokesReceivedByHole(
  playingHandicapStrokes: number,
  holes: readonly EventHoleSnapshot[],
): Map<number, number> {
  const out = new Map<number, number>();
  if (holes.length === 0) return out;

  const n = Math.max(0, Math.round(playingHandicapStrokes));
  const hCount = holes.length;
  const base = Math.floor(n / hCount);
  const remainder = n % hCount;

  const sorted = [...holes].sort((a, b) => a.strokeIndex - b.strokeIndex);
  for (let i = 0; i < sorted.length; i++) {
    const rank = i + 1;
    const s = base + (rank <= remainder ? 1 : 0);
    out.set(sorted[i]!.holeNumber, s);
  }
  return out;
}
