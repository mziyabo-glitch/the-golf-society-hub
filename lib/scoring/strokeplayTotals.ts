import type { PlayerHoleScore, StrokeplayResult } from "@/lib/scoring/eventScoringTypes";

export function sumGrossStrokes(holes: readonly PlayerHoleScore[]): number {
  return holes.reduce((a, h) => a + h.grossStrokes, 0);
}

export function sumNetStrokes(holes: readonly PlayerHoleScore[]): number {
  return holes.reduce((a, h) => a + h.netStrokes, 0);
}

export function buildStrokeplayResult(
  format: "strokeplay_net" | "strokeplay_gross",
  holes: PlayerHoleScore[],
): StrokeplayResult {
  return {
    format,
    holes,
    totalNetStrokes: format === "strokeplay_net" ? sumNetStrokes(holes) : null,
    totalGrossStrokes: sumGrossStrokes(holes),
  };
}
