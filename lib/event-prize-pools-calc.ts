/**
 * Prize pool payout math: ranking, tie groups, and pence allocation (deterministic).
 */
import type {
  PrizePoolEntrant,
  PrizePoolCalculationResultRow,
  EventPrizePoolRow,
} from "@/lib/event-prize-pools-types";

/** Mirrors `getFormatSortOrder` in eventRepo — kept local so this module stays testable without React Native. */
export type PrizePoolEventFormat = "stableford" | "strokeplay_net" | "strokeplay_gross" | "medal" | string;

export function getFormatSortOrderForPrizePool(format: string | undefined): "high_wins" | "low_wins" {
  if (!format) return "high_wins";
  const normalized = format.toLowerCase();
  if (
    normalized.includes("strokeplay") ||
    normalized.includes("medal") ||
    normalized.includes("gross") ||
    normalized.includes("net")
  ) {
    return "low_wins";
  }
  return "high_wins";
}

export const PRIZE_POOL_UNSUPPORTED_FORMAT_MESSAGE =
  "This event format is not yet supported for prize pool calculation.";

const SUPPORTED: Set<string> = new Set([
  "stableford",
  "strokeplay_net",
  "strokeplay_gross",
  "medal",
]);

export function isPrizePoolSupportedEventFormat(format: string | undefined | null): boolean {
  if (!format) return false;
  return SUPPORTED.has(String(format).toLowerCase());
}

export function prizePoolSortOrderForEventFormat(format: string | undefined | null): "high_wins" | "low_wins" {
  return getFormatSortOrderForPrizePool(format ?? undefined);
}

/** Basis points must sum to 10_000 (100.00%). */
export function validateRuleBasisPointsTotal(rules: { percentage_basis_points: number }[]): {
  ok: boolean;
  sum: number;
} {
  const sum = rules.reduce((a, r) => a + (Number(r.percentage_basis_points) || 0), 0);
  return { ok: sum === 10_000, sum };
}

export function formatPrizePoolScoreDisplay(
  eventFormat: PrizePoolEventFormat | undefined,
  dayValue: number,
): string {
  const f = String(eventFormat ?? "stableford").toLowerCase();
  if (f === "stableford") return `${dayValue} pts`;
  if (f === "strokeplay_gross") return `${dayValue} gross`;
  return `${dayValue} net`;
}

function compareEntrants(a: PrizePoolEntrant, b: PrizePoolEntrant): number {
  if (a.sortOrder === "low_wins") {
    if (a.dayValue !== b.dayValue) return a.dayValue - b.dayValue;
  } else {
    if (a.dayValue !== b.dayValue) return b.dayValue - a.dayValue;
  }
  return a.participantKey.localeCompare(b.participantKey);
}

/** Competition ranking: ties share start rank; next rank skips by tie size. */
export function assignFinishingPositions(
  entrants: PrizePoolEntrant[],
): { participantKey: string; position: number }[] {
  const sorted = [...entrants].sort(compareEntrants);
  const out: { participantKey: string; position: number }[] = [];
  let i = 0;
  let nextRank = 1;
  while (i < sorted.length) {
    const v = sorted[i].dayValue;
    let k = 1;
    while (i + k < sorted.length && sorted[i + k].dayValue === v) k++;
    for (let j = 0; j < k; j++) {
      out.push({ participantKey: sorted[i + j].participantKey, position: nextRank });
    }
    nextRank += k;
    i += k;
  }
  return out;
}

type TieGroup = { position: number; participantKeys: string[] };

export function groupByTies(ordered: { participantKey: string; position: number }[]): TieGroup[] {
  const groups: TieGroup[] = [];
  let i = 0;
  while (i < ordered.length) {
    const pos = ordered[i].position;
    const ids: string[] = [];
    while (i < ordered.length && ordered[i].position === pos) {
      ids.push(ordered[i].participantKey);
      i++;
    }
    groups.push({ position: pos, participantKeys: ids.sort((a, b) => a.localeCompare(b)) });
  }
  return groups;
}

/**
 * Build payout rows for one division pot. `rulesBps[i]` = percentage for finishing place i+1 (sum 10_000).
 * Sums to `divisionPotPence` exactly.
 */
export function allocateDivisionPotPence(params: {
  entrants: PrizePoolEntrant[];
  rulesBps: number[];
  divisionPotPence: number;
  divisionName: string | null;
  eventFormat: string;
}): PrizePoolCalculationResultRow[] {
  const { entrants, rulesBps, divisionPotPence, divisionName, eventFormat } = params;
  const placesPaid = rulesBps.length;
  if (placesPaid === 0 || divisionPotPence === 0) return [];

  const byKey = new Map(entrants.map((e) => [e.participantKey, e]));
  const positions = assignFinishingPositions(entrants);
  const groups = groupByTies(positions);

  type Proto = {
    participantKey: string;
    finishingPosition: number;
    tieSize: number;
    floorPence: number;
    sortKey: number;
    tieNote: string | null;
  };
  const protos: Proto[] = [];

  let slotIdx = 0;
  let sortKey = 0;

  for (const g of groups) {
    const k = g.participantKeys.length;
    const remainingSlots = placesPaid - slotIdx;
    if (remainingSlots <= 0) {
      for (const pk of g.participantKeys) {
        protos.push({
          participantKey: pk,
          finishingPosition: g.position,
          tieSize: k,
          floorPence: 0,
          sortKey: sortKey++,
          tieNote: k > 1 ? `Tied at position ${g.position}.` : null,
        });
      }
      continue;
    }

    const slotsToConsume = Math.min(k, remainingSlots);
    let combinedBps = 0;
    for (let s = 0; s < slotsToConsume; s++) {
      combinedBps += rulesBps[slotIdx + s] ?? 0;
    }
    slotIdx += slotsToConsume;

    const groupTotalPence = Math.floor((combinedBps * divisionPotPence) / 10_000);
    const base = Math.floor(groupTotalPence / k);
    let innerRem = groupTotalPence - base * k;
    const tieNote =
      k > 1 && combinedBps > 0
        ? `Tied at position ${g.position} — shared prize allocation (${k} players).`
        : k > 1
          ? `Tied at position ${g.position}.`
          : null;
    for (const pk of g.participantKeys) {
      let add = base;
      if (innerRem > 0) {
        add += 1;
        innerRem -= 1;
      }
      protos.push({
        participantKey: pk,
        finishingPosition: g.position,
        tieSize: k,
        floorPence: add,
        sortKey: sortKey++,
        tieNote,
      });
    }
  }

  let sum = protos.reduce((a, p) => a + p.floorPence, 0);
  let diff = divisionPotPence - sum;
  const order = [...protos].sort((a, b) => {
    if (a.finishingPosition !== b.finishingPosition) return a.finishingPosition - b.finishingPosition;
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return a.participantKey.localeCompare(b.participantKey);
  });

  while (diff > 0 && order.length > 0) {
    for (const target of order) {
      if (diff <= 0) break;
      const idx = protos.findIndex(
        (x) => x.participantKey === target.participantKey && x.sortKey === target.sortKey,
      );
      if (idx >= 0) protos[idx].floorPence += 1;
      diff -= 1;
    }
  }

  sum = protos.reduce((a, p) => a + p.floorPence, 0);
  diff = divisionPotPence - sum;
  const negOrder = [...order].reverse();
  while (diff < 0 && negOrder.length > 0) {
    let progressed = false;
    for (const target of negOrder) {
      if (diff >= 0) break;
      const idx = protos.findIndex(
        (x) => x.participantKey === target.participantKey && x.sortKey === target.sortKey,
      );
      if (idx >= 0 && protos[idx].floorPence > 0) {
        protos[idx].floorPence -= 1;
        diff += 1;
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  return protos.map((p) => {
    const e = byKey.get(p.participantKey);
    const mid = e?.memberId ?? null;
    const gid = e?.guestId ?? null;
    return {
      participantKey: p.participantKey,
      memberId: mid,
      guestId: gid,
      eventRegistrationId: e?.registrationId ?? null,
      divisionName,
      finishingPosition: p.finishingPosition,
      tieSize: p.tieSize,
      payoutAmountPence: p.floorPence,
      calculationNote: p.tieNote,
      scoreDisplay: e ? formatPrizePoolScoreDisplay(eventFormat, e.dayValue) : null,
    };
  });
}

/** Split total pence across `parts` segments; remainder goes to lowest sort index first. */
export function splitPotEvenlyAcrossDivisions(totalPence: number, partCount: number): number[] {
  if (partCount <= 0) return [];
  const base = Math.floor(totalPence / partCount);
  let rem = totalPence - base * partCount;
  const out = Array.from({ length: partCount }, () => base);
  for (let i = 0; i < rem; i++) out[i] += 1;
  return out;
}

/** v1: entrants are pre-filtered to Pot Master–confirmed list with official results. */
export function filterEligiblePrizePoolEntrants(
  _pool: Pick<EventPrizePoolRow, "require_paid" | "require_confirmed" | "include_guests">,
  entrants: PrizePoolEntrant[],
): PrizePoolEntrant[] {
  return entrants;
}

export function resolveDivisionForHandicap(
  handicap: number | null | undefined,
  divisions: { name: string; sort_order: number; min_handicap: number | null; max_handicap: number | null }[],
): string | null {
  if (handicap == null || Number.isNaN(Number(handicap))) return null;
  const h = Number(handicap);
  const sorted = [...divisions].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });
  for (const d of sorted) {
    const min = d.min_handicap;
    const max = d.max_handicap;
    const okMin = min == null || h >= Number(min);
    const okMax = max == null || h <= Number(max);
    if (okMin && okMax) return d.name;
  }
  return null;
}
