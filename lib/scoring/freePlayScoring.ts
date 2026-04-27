/**
 * Pure deterministic scoring for Free Play v1 (stroke net + Stableford leaderboard).
 * Reuses WHS stroke allocation and society Stableford table.
 */

import type { EventHoleSnapshot } from "@/lib/scoring/eventScoringTypes";
import { buildStrokesReceivedByHole } from "@/lib/scoring/handicapStrokeAllocation";
import { stablefordPointsForHole } from "@/lib/scoring/stablefordPoints";
import type { FreePlayScoringFormat } from "@/types/freePlayScorecard";

export type FreePlayHoleLike = {
  hole_number: number;
  par: number | null;
  stroke_index: number | null;
  yardage?: number | null;
};

/** Map DB `course_holes` rows to stroke-allocation snapshots (defaults when metadata missing). */
export function freePlayHolesToSnapshots(holes: readonly FreePlayHoleLike[]): EventHoleSnapshot[] {
  const sorted = [...holes].sort((a, b) => a.hole_number - b.hole_number);
  return sorted.map((h, idx) => ({
    holeNumber: h.hole_number,
    par: Number.isFinite(Number(h.par)) && Number(h.par) > 0 ? Math.round(Number(h.par)) : 4,
    yardage: Number.isFinite(Number(h.yardage)) ? Math.round(Number(h.yardage)) : 400,
    strokeIndex:
      Number.isFinite(Number(h.stroke_index)) && Number(h.stroke_index) > 0
        ? Math.round(Number(h.stroke_index))
        : idx + 1,
  }));
}

export function intPlayingHandicap(playingHandicap: number | null | undefined, handicapIndexFallback: number): number {
  if (playingHandicap != null && Number.isFinite(Number(playingHandicap))) {
    return Math.max(0, Math.round(Number(playingHandicap)));
  }
  const hi = Number.isFinite(Number(handicapIndexFallback)) ? Number(handicapIndexFallback) : 0;
  return Math.max(0, Math.round(hi));
}

export type FreePlayLeaderboardInputPlayer = {
  roundPlayerId: string;
  displayName: string;
  playingHandicap: number | null;
  handicapIndex: number;
  /** Hole number → gross strokes, or null = pickup / NR (excluded from net/SF sums). */
  grossByHole: ReadonlyMap<number, number | null>;
};

export type FreePlayLeaderboardRow = {
  roundPlayerId: string;
  displayName: string;
  /** Count of holes with a recorded gross score. */
  thru: number;
  /** Sum of (gross − strokes received) over scored holes only. */
  netTotal: number | null;
  /** Sum of Stableford points over scored holes only. */
  stablefordPoints: number | null;
};

/**
 * Per-player aggregates then sort for leaderboard:
 * - `stroke_net`: ascending net (lower better); tie-break more holes scored, then name.
 * - `stableford`: descending points; tie-break more holes scored, then name.
 */
export function buildFreePlayLeaderboard(
  format: FreePlayScoringFormat,
  holes: readonly EventHoleSnapshot[],
  players: readonly FreePlayLeaderboardInputPlayer[],
): FreePlayLeaderboardRow[] {
  const rows: FreePlayLeaderboardRow[] = players.map((p) => {
    const ph = intPlayingHandicap(p.playingHandicap, p.handicapIndex);
    const strokeMap = holes.length > 0 ? buildStrokesReceivedByHole(ph, holes) : new Map<number, number>();
    let netSum = 0;
    let sfSum = 0;
    let thru = 0;

    for (const h of holes) {
      const g = p.grossByHole.get(h.holeNumber);
      if (g == null || !Number.isFinite(g)) continue;
      thru += 1;
      const sr = strokeMap.get(h.holeNumber) ?? 0;
      const net = Math.round(g - sr);
      netSum += net;
      sfSum += stablefordPointsForHole(net, h.par);
    }

    const hasScores = thru > 0;
    return {
      roundPlayerId: p.roundPlayerId,
      displayName: p.displayName,
      thru,
      netTotal: hasScores ? netSum : null,
      stablefordPoints: hasScores ? sfSum : null,
    };
  });

  const sorted = [...rows].sort((a, b) => {
    if (format === "stableford") {
      const ap = a.stablefordPoints ?? -Infinity;
      const bp = b.stablefordPoints ?? -Infinity;
      if (bp !== ap) return bp - ap;
      if (b.thru !== a.thru) return b.thru - a.thru;
      return a.displayName.localeCompare(b.displayName);
    }
    const an = a.netTotal ?? Infinity;
    const bn = b.netTotal ?? Infinity;
    if (an !== bn) return an - bn;
    if (b.thru !== a.thru) return b.thru - a.thru;
    return a.displayName.localeCompare(b.displayName);
  });

  return sorted;
}
