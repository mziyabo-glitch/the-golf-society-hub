/**
 * Major multi-day events: each round's OOM uses the GameBook **Today** score only,
 * not cumulative tournament standing.
 */

import {
  formatGameBookTodayScore,
  isOomPointsEvent,
  parseGameBookTodayScore,
  usesMajorStablefordNetTodayScoring,
} from "@/lib/oomEventClassification";
import type { OomScoringDebugRow } from "@/lib/oomJointField";

export type MajorDayOomDebugRow = OomScoringDebugRow & {
  /** GameBook / manual "Today" column (signed net-to-par for major stableford NET). */
  todayScore: number | null;
  /** Finishing place for this round only. */
  day2Position: number | null;
  /** Optional cumulative tournament rank (display only; never used for OOM slots). */
  tournamentPosition?: number | null;
  majorPoints: number;
};

export function resolveOomDayPointsInput(
  dayPoints: string,
  format: string | undefined,
  classification: string | null | undefined,
  eventName?: string | null,
): string {
  if (!usesMajorStablefordNetTodayScoring(format, classification, { eventName })) {
    return dayPoints;
  }
  const parsed = parseGameBookTodayScore(dayPoints);
  if (parsed == null) return dayPoints.trim();
  return String(parsed);
}

export function buildMajorDayOomDebugRows(
  scored: Array<{
    memberId: string;
    memberName?: string;
    dayPoints: string;
    position: number | null;
    oomPoints: number;
    isOomEligible?: boolean;
    societyId?: string | null;
    tournamentPosition?: number | null;
  }>,
  event: { format?: string; classification?: string | null; name?: string | null; eventName?: string | null },
): MajorDayOomDebugRow[] {
  const majorNetToday = usesMajorStablefordNetTodayScoring(event.format, event.classification, {
    eventName: event.eventName ?? event.name,
  });
  return scored
    .filter((p) => p.dayPoints.trim() !== "" && !Number.isNaN(parseInt(p.dayPoints.trim(), 10)))
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .map((p) => {
      const todayParsed = majorNetToday
        ? parseGameBookTodayScore(p.dayPoints) ?? parseInt(p.dayPoints.trim(), 10)
        : parseInt(p.dayPoints.trim(), 10);
      return {
        name: String(p.memberName ?? p.memberId),
        memberId: p.memberId,
        societyId: p.societyId ?? null,
        netScore: parseInt(p.dayPoints.trim(), 10),
        todayScore: Number.isFinite(todayParsed) ? todayParsed : null,
        fieldPosition: p.position,
        day2Position: p.position,
        tournamentPosition: p.tournamentPosition ?? null,
        isOomEligible: p.isOomEligible ?? !String(p.memberId).startsWith("guest-"),
        oomPoints: p.oomPoints,
        majorPoints: p.oomPoints,
      };
    });
}

export function logMajorDayOomBreakdown(
  label: string,
  rows: MajorDayOomDebugRow[],
  extra?: Record<string, unknown>,
): void {
  console.log(`[major-day-oom] ${label}`, {
    ...extra,
    entrantCount: rows.length,
    rows: rows.map((r) => ({
      player: r.name,
      todayScore: r.todayScore != null ? formatGameBookTodayScore(r.todayScore) : null,
      day2Position: r.day2Position,
      tournamentPosition: r.tournamentPosition ?? null,
      isOomEligible: r.isOomEligible,
      societyId: r.societyId,
      majorPoints: r.majorPoints,
    })),
  });
}

export function shouldUseMajorDayOomPipeline(event: {
  format?: string;
  classification?: string | null;
  isOOM?: boolean | null;
  name?: string | null;
}): boolean {
  return (
    isOomPointsEvent(event) &&
    usesMajorStablefordNetTodayScoring(event.format, event.classification, { eventName: event.name })
  );
}
