/**
 * Pure scoring from {@link EventScoringContext} (immutable event course data + member handicaps).
 * Gross strokes per hole are the only score entry inputs in this phase.
 */

import type {
  EnteredHoleScoringRow,
  EnteredRoundComputation,
  EventScoringContext,
  PlayerHoleScore,
  PlayerRoundScore,
  StablefordHoleResult,
} from "@/lib/scoring/eventScoringTypes";
import { buildStrokesReceivedByHole } from "@/lib/scoring/handicapStrokeAllocation";
import { stablefordPointsForHole } from "@/lib/scoring/stablefordPoints";
import { buildStrokeplayResult } from "@/lib/scoring/strokeplayTotals";

export type GrossStrokesByHole = Readonly<Record<number, number>>;

function requireGross(grossByHole: GrossStrokesByHole, holeNumber: number): number {
  const g = grossByHole[holeNumber];
  if (!Number.isFinite(g)) {
    throw new Error(`scorePlayerRoundFromGross: missing or invalid gross strokes for hole ${holeNumber}`);
  }
  return Math.round(Number(g));
}

/**
 * Compute round score for one player from a gross scorecard and canonical event context.
 */
/**
 * Score **only holes present in `grossByHole`** (partial entry supported).
 * Strokes received use the full WHS allocation table for the event hole snapshot + playing handicap.
 * Totals (gross/net/stableford) sum **entered holes only** — recalculate on every save.
 */
export function scoreEnteredHolesFromGross(
  ctx: EventScoringContext,
  playerId: string,
  grossByHole: Readonly<Record<number, number>>,
): EnteredRoundComputation {
  const p = ctx.players.find((x) => x.memberId === playerId);
  if (!p) throw new Error(`scoreEnteredHolesFromGross: unknown player ${playerId}`);

  const enteredNumbers = Object.keys(grossByHole)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);

  const phInt =
    ctx.format === "strokeplay_gross" ? 0 : p.playingHandicap != null ? Math.round(p.playingHandicap) : 0;
  const strokeMap =
    ctx.format === "strokeplay_gross" ? new Map<number, number>() : buildStrokesReceivedByHole(phInt, ctx.holes);

  const enteredHoles: EnteredHoleScoringRow[] = [];
  for (const holeNumber of enteredNumbers) {
    const holeMeta = ctx.holes.find((h) => h.holeNumber === holeNumber);
    if (!holeMeta) {
      throw new Error(`scoreEnteredHolesFromGross: hole ${holeNumber} is not on the event hole snapshot.`);
    }
    const raw = grossByHole[holeNumber as keyof typeof grossByHole];
    const gross = Math.round(Number(raw));
    const sr = strokeMap.get(holeNumber) ?? 0;
    const net = gross - sr;
    const stablefordPoints = ctx.format === "stableford" ? stablefordPointsForHole(net, holeMeta.par) : 0;
    enteredHoles.push({
      holeNumber,
      grossStrokes: gross,
      strokesReceived: sr,
      netStrokes: net,
      stablefordPoints,
    });
  }

  const grossTotal = enteredHoles.reduce((a, h) => a + h.grossStrokes, 0);
  const netTotal = enteredHoles.reduce((a, h) => a + h.netStrokes, 0);
  const stablefordPointsTotal = enteredHoles.reduce((a, h) => a + h.stablefordPoints, 0);
  const eventHoleCount = ctx.holes.length;
  const isComplete = enteredHoles.length === eventHoleCount;

  return {
    playerId,
    format: ctx.format,
    enteredHoles,
    holesPlayed: enteredHoles.length,
    grossTotal,
    netTotal,
    stablefordPointsTotal,
    courseHandicap: p.courseHandicap,
    playingHandicap: p.playingHandicap,
    eventHoleCount,
    isComplete,
  };
}

export function scorePlayerRoundFromGross(
  ctx: EventScoringContext,
  playerId: string,
  grossByHole: GrossStrokesByHole,
): PlayerRoundScore {
  const p = ctx.players.find((x) => x.memberId === playerId);
  if (!p) throw new Error(`scorePlayerRoundFromGross: unknown player ${playerId}`);

  for (const h of ctx.holes) {
    requireGross(grossByHole, h.holeNumber);
  }

  if (ctx.format === "strokeplay_gross") {
    const holes: PlayerHoleScore[] = ctx.holes.map((h) => {
      const gross = requireGross(grossByHole, h.holeNumber);
      return {
        holeNumber: h.holeNumber,
        grossStrokes: gross,
        strokesReceived: 0,
        netStrokes: gross,
      };
    });
    return {
      kind: "strokeplay_gross",
      playerId,
      strokeplay: buildStrokeplayResult("strokeplay_gross", holes),
    };
  }

  const phInt = p.playingHandicap != null ? Math.round(p.playingHandicap) : 0;
  const strokeMap = buildStrokesReceivedByHole(phInt, ctx.holes);

  const baseHoles: PlayerHoleScore[] = ctx.holes.map((h) => {
    const gross = requireGross(grossByHole, h.holeNumber);
    const sr = strokeMap.get(h.holeNumber) ?? 0;
    const net = gross - sr;
    return {
      holeNumber: h.holeNumber,
      grossStrokes: gross,
      strokesReceived: sr,
      netStrokes: net,
    };
  });

  if (ctx.format === "stableford") {
    const holes: StablefordHoleResult[] = baseHoles.map((row) => {
      const par = ctx.holes.find((x) => x.holeNumber === row.holeNumber)!.par;
      const stablefordPoints = stablefordPointsForHole(row.netStrokes, par);
      return { ...row, stablefordPoints };
    });
    const totalStablefordPoints = holes.reduce((a, h) => a + h.stablefordPoints, 0);
    return { kind: "stableford", playerId, holes, totalStablefordPoints };
  }

  if (ctx.format === "strokeplay_net") {
    return {
      kind: "strokeplay_net",
      playerId,
      strokeplay: buildStrokeplayResult("strokeplay_net", baseHoles),
    };
  }

  throw new Error(`scorePlayerRoundFromGross: unsupported format ${String(ctx.format)}`);
}

export type StablefordRankingRow = { playerId: string; totalStablefordPoints: number };

/** Highest points wins. */
export function rankStablefordResults(rows: readonly StablefordRankingRow[]): StablefordRankingRow[] {
  return [...rows].sort((a, b) => b.totalStablefordPoints - a.totalStablefordPoints);
}

export type StrokeplayRankingRow = { playerId: string; total: number; kind: "net" | "gross" };

/** Lowest total wins (net or gross). */
export function rankStrokeplayLowWins(rows: readonly StrokeplayRankingRow[]): StrokeplayRankingRow[] {
  return [...rows].sort((a, b) => a.total - b.total);
}
