/**
 * Copy and rule lines for prize pool PNG / share exports — aligned with event format semantics.
 */

import { EVENT_FORMATS, type EventFormat } from "@/lib/db_supabase/eventRepo";
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
