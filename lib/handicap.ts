/**
 * Handicap calculation helpers for events
 */

import type { MemberData, Course, TeeSet, EventData } from "./models";
import { calculatePlayingHandicapFromIndex } from "./whs";

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
  if (member.handicap === undefined) {
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

  // Calculate playing handicap
  return calculatePlayingHandicapFromIndex(
    member.handicap,
    teeSet,
    allowance as 0.9 | 1.0
  );
}

/**
 * Get course handicap for a member (before allowance)
 */
export function getCourseHandicap(
  member: MemberData,
  maleTeeSet: TeeSet | null,
  femaleTeeSet: TeeSet | null
): number | null {
  if (member.handicap === undefined || !member.sex) {
    return null;
  }

  const teeSet = member.sex === "male" ? maleTeeSet : femaleTeeSet;
  if (!teeSet) {
    return null;
  }

  const { calculateCourseHandicap } = require("./whs");
  return calculateCourseHandicap(member.handicap, teeSet);
}

