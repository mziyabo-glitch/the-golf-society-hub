/**
 * Copy and rule lines for prize pool PNG / share exports — aligned with event format semantics.
 */

import { EVENT_FORMATS, type EventFormat } from "@/lib/db_supabase/eventRepo";
import { formatPenceGbp } from "@/lib/db_supabase/eventPrizePoolRepo";
import type { EventPrizePoolResultRow, EventPrizePoolRow } from "@/lib/event-prize-pools-types";
import { prizePoolSortOrderForEventFormat } from "@/lib/event-prize-pools-calc";

export function eventFormatDisplayLabel(format: string | undefined | null): string {
  const raw = String(format ?? "").trim().toLowerCase();
  if (!raw) return "Format not set";
  if (raw === "medal") return "Medal (Net)";
  const hit = EVENT_FORMATS.find((x) => x.value === (raw as EventFormat));
  return hit?.label ?? format ?? "Competition";
}

/** One line for share cards: how prize pool ranking relates to this event format. */
export function prizePoolRankingPolicyLine(format: string | undefined | null): string {
  const label = eventFormatDisplayLabel(format);
  const order = prizePoolSortOrderForEventFormat(format);
  if (order === "high_wins") {
    return `${label} — placings use highest score (Stableford points).`;
  }
  return `${label} — placings use lowest score (net / gross strokeplay).`;
}

export function buildStandardPoolRuleLines(params: {
  placesPaid: number;
  percents: number[];
  payoutMode: "overall" | "division";
}): string[] {
  const { placesPaid, percents, payoutMode } = params;
  const lines: string[] = [];
  lines.push(
    payoutMode === "division"
      ? "Payout structure: per division (pot split across active divisions, then percentages within each)."
      : "Payout structure: overall field (percentages apply to the combined pot).",
  );
  for (let i = 0; i < placesPaid; i++) {
    const ord = i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`;
    lines.push(`${ord}: ${percents[i] ?? 0}% of the allocated pot`);
  }
  return lines;
}

export function splitterPoolRuleLines(): string[] {
  return [
    "Fixed splitter: Best Front 9 — 20% · Best Back 9 — 20% · Most Birdies — 20% · Best Overall Score — 40%.",
    "Official full scores come from event results; Pot Master enters Front 9, Back 9, and Birdies only.",
    "If no birdies are recorded, the birdie share rolls into Best Overall Score.",
  ];
}

const SPLITTER_CATEGORY_ORDER = [
  "Best Front 9",
  "Best Back 9",
  "Most Birdies",
  "Best Overall Score",
] as const;

export type PrizePoolResultsShareRow = {
  playerName: string;
  positionLine: string;
  scoreLine: string;
  payoutLine: string;
  note: string | null;
};

export type PrizePoolResultsShareSection = {
  title: string | null;
  rows: PrizePoolResultsShareRow[];
};

function resolveResultPlayerName(
  r: EventPrizePoolResultRow,
  nameByMemberId: Map<string, string>,
  nameByGuestId?: Map<string, string>,
): string {
  if (r.member_id) return (nameByMemberId.get(String(r.member_id)) ?? "Member").trim();
  if (r.event_guest_id) return (nameByGuestId?.get(String(r.event_guest_id)) ?? "Guest").trim();
  return "—";
}

/**
 * Group/sort payout rows for PNG export — mirrors {@link PrizePoolSummary} section logic.
 */
export function buildPrizePoolResultsShareSections(params: {
  pool: EventPrizePoolRow;
  results: EventPrizePoolResultRow[];
  nameByMemberId: Map<string, string>;
  nameByGuestId?: Map<string, string>;
}): PrizePoolResultsShareSection[] {
  const { pool, results, nameByMemberId, nameByGuestId } = params;
  const isSplitter = pool.competition_type === "splitter";

  const byDivision = new Map<string | null, EventPrizePoolResultRow[]>();
  for (const r of results) {
    const k = r.division_name ?? null;
    if (!byDivision.has(k)) byDivision.set(k, []);
    byDivision.get(k)!.push(r);
  }

  const sections = [...byDivision.entries()].sort(([a], [b]) => {
    if (isSplitter) {
      const ai = SPLITTER_CATEGORY_ORDER.indexOf((a ?? "") as (typeof SPLITTER_CATEGORY_ORDER)[number]);
      const bi = SPLITTER_CATEGORY_ORDER.indexOf((b ?? "") as (typeof SPLITTER_CATEGORY_ORDER)[number]);
      if (ai !== -1 || bi !== -1) {
        const aa = ai === -1 ? 999 : ai;
        const bb = bi === -1 ? 999 : bi;
        return aa - bb;
      }
    }
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    return a.localeCompare(b);
  });

  return sections.map(([divName, rows]) => ({
    title: divName,
    rows: [...rows]
      .sort((a, b) => {
        if (a.finishing_position !== b.finishing_position) return a.finishing_position - b.finishing_position;
        const ka = String(a.member_id ?? a.event_guest_id ?? a.id);
        const kb = String(b.member_id ?? b.event_guest_id ?? b.id);
        return ka.localeCompare(kb);
      })
      .map((r) => ({
        playerName: resolveResultPlayerName(r, nameByMemberId, nameByGuestId),
        positionLine: `Position ${r.finishing_position}${r.tie_size > 1 ? ` · Tie ${r.tie_size}` : ""}`,
        scoreLine: (r.score_display ?? "—").trim() || "—",
        payoutLine: formatPenceGbp(r.payout_amount_pence),
        note: r.calculation_note?.trim() || null,
      })),
  }));
}
