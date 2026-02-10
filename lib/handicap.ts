/**
 * Handicap calculation helpers for events
 */

import type { MemberData, Course, TeeSet, EventData } from "./models";
import { calcCourseHandicap, calcPlayingHandicap } from "./whs";

export function isValidHandicap(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Get playing handicap for a member in an event
 * Returns null if tee sets are not configured
 */
export function getPlayingHandicap(
  member: MemberData,
  event: EventData,
  course: Course | null,
  maleTeeSet: TeeSet | null,
  femaleTeeSet: TeeSet | null
): number | null {
  // Member must have handicap index
  if (!isValidHandicap(member.handicap)) {
    return null;
  }

  // Member must have sex
  if (!member.sex) {
    return null;
  }

  // Get appropriate tee set
  const teeSet = member.sex === "male" ? maleTeeSet : femaleTeeSet;
  if (!teeSet) {
    return null;
  }

  // Get allowance (prefer percentage, fallback to 0.9/1.0)
  const allowance = event.handicapAllowancePct
    ? event.handicapAllowancePct / 100
    : event.handicapAllowance ?? 1.0;

  // Calculate course handicap then playing handicap
  const courseHandicap = calcCourseHandicap(member.handicap, teeSet);
  const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);
  return playingHandicap;
}

/**
 * Get course handicap for a member (before allowance)
 */
export function getCourseHandicap(
  member: MemberData,
  maleTeeSet: TeeSet | null,
  femaleTeeSet: TeeSet | null
): number | null {
  if (!isValidHandicap(member.handicap) || !member.sex) {
    return null;
  }

  const teeSet = member.sex === "male" ? maleTeeSet : femaleTeeSet;
  if (!teeSet) {
    return null;
  }

  return calcCourseHandicap(member.handicap, teeSet);
}

