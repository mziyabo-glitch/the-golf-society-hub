/**
 * Society OOM / Major events that award F1 Order-of-Merit points on `event_results.points`.
 */

import type { OomFieldSortOrder } from "@/lib/oomMemberOnlyScoring";

export type EventFormatLike = "stableford" | "strokeplay_net" | "strokeplay_gross" | string;

export function isOomPointsClassification(classification: string | null | undefined): boolean {
  const c = String(classification ?? "").toLowerCase();
  return c === "oom" || c === "major";
}

/** True when this event awards society OOM / Major day points. */
export function isOomPointsEvent(input: {
  classification?: string | null;
  isOOM?: boolean | null;
  is_oom?: boolean | null;
}): boolean {
  if (input.isOOM === true || input.is_oom === true) return true;
  return isOomPointsClassification(input.classification);
}

function baseFormatSortOrder(format: string | undefined): OomFieldSortOrder {
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

export type OomScoringContext = {
  eventName?: string | null;
};

/** True for OOM Major Day 1/2 rounds named e.g. "OOM 5 - Donnington Major Day 1". */
export function isOomMajorGameBookDayRound(
  classification: string | null | undefined,
  eventName?: string | null,
): boolean {
  const c = String(classification ?? "").toLowerCase();
  if (c !== "oom") return false;
  return /major\s+day\s*[12]/i.test(String(eventName ?? ""));
}

/** @deprecated Use {@link isOomMajorGameBookDayRound}. */
export function isOomMajorDay2Round(
  classification: string | null | undefined,
  eventName?: string | null,
): boolean {
  return isOomMajorGameBookDayRound(classification, eventName);
}

/**
 * Major multi-day Stableford NET (GameBook "Today") ranks by day net-to-par — lower is better.
 * Standard stableford OOM uses total points (high wins). Strokeplay uses low wins.
 */
export function usesMajorStablefordNetTodayScoring(
  format: string | undefined,
  classification: string | null | undefined,
  context?: OomScoringContext,
): boolean {
  if (String(format ?? "").toLowerCase() !== "stableford") return false;
  const c = String(classification ?? "").toLowerCase();
  if (c === "major") return true;
  return isOomMajorGameBookDayRound(c, context?.eventName);
}

export function getOomDaySortOrder(
  format: string | undefined,
  classification?: string | null,
  context?: OomScoringContext,
): OomFieldSortOrder {
  if (usesMajorStablefordNetTodayScoring(format, classification, context)) {
    return "low_wins";
  }
  return baseFormatSortOrder(format);
}

/** Parse GameBook Stableford NET "Today" column (E, -6, +3) to a signed integer. */
export function parseGameBookTodayScore(raw: string): number | null {
  const t = raw.trim().toUpperCase();
  if (t === "" || t === "—" || t === "-") return null;
  if (t === "E" || t === "EVEN" || t === "0") return 0;
  const m = /^([+-])?(\d+)$/.exec(t.replace(/\s/g, ""));
  if (!m) return null;
  const n = parseInt(m[2]!, 10);
  if (Number.isNaN(n)) return null;
  if (m[1] === "-") return -n;
  if (m[1] === "+") return n;
  return n;
}

/** Format a signed today score for display / persistence text fields. */
export function formatGameBookTodayScore(value: number): string {
  if (value === 0) return "0";
  if (value > 0) return `+${value}`;
  return String(value);
}

/**
 * Day-value for OOM when publishing gross-score rounds.
 * Major stableford NET: net-to-par for the day (matches GameBook "Today"), not cumulative tournament total.
 */
export function dayValueForOomFromLeaderboardRow(input: {
  format: EventFormatLike;
  classification?: string | null;
  eventName?: string | null;
  stableford_points: number;
  net_total: number;
  par: number | null | undefined;
}): number {
  if (usesMajorStablefordNetTodayScoring(input.format, input.classification, { eventName: input.eventName })) {
    const par = input.par ?? 72;
    return input.net_total - par;
  }
  if (String(input.format).toLowerCase() === "stableford") {
    return input.stableford_points;
  }
  if (String(input.format).toLowerCase() === "strokeplay_net") {
    return input.net_total;
  }
  return input.net_total;
}
