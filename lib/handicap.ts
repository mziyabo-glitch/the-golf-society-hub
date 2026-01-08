/**
 * Handicap calculation helpers for events
 * 
 * Uses WHS (World Handicap System) formulas:
 * - Course Handicap = HI × (SR / 113) + (CR − Par)
 * - Playing Handicap = round(Course Handicap × Allowance)
 */

import type { MemberData, Course, TeeSet, EventData, GuestData } from "./models";
import { calculatePlayingHandicapFromIndex, calculateCourseHandicap as whsCalculateCourseHandicap, validateTeeSet } from "./whs";

/**
 * Error thrown when WHS calculation fails due to missing data
 */
export class WHSCalculationError extends Error {
  constructor(message: string, public readonly field: string) {
    super(message);
    this.name = "WHSCalculationError";
  }
}

/**
 * Get the appropriate tee set for a player based on sex
 * - male -> male tee set
 * - female -> female tee set
 * - undefined -> defaults to male (with dev warning)
 */
export function getTeeSetForPlayer(
  playerSex: "male" | "female" | undefined,
  maleTeeSet: TeeSet | null,
  femaleTeeSet: TeeSet | null
): TeeSet | null {
  // If sex is missing, default to male but log in dev
  if (!playerSex) {
    if (__DEV__) {
      console.warn("[WHS] Player sex is undefined, defaulting to male tee set");
    }
    return maleTeeSet;
  }
  return playerSex === "male" ? maleTeeSet : femaleTeeSet;
}

/**
 * Get handicap allowance percentage from event
 * Prefers handicapAllowancePct, falls back to handicapAllowance (0.9/1.0), default 100%
 */
export function getEventAllowancePercent(event: EventData | null): number {
  if (!event) {
    return 100;
  }
  if (typeof event.handicapAllowancePct === "number") {
    return event.handicapAllowancePct;
  }
  if (event.handicapAllowance === 0.9) {
    return 90;
  }
  return 100; // Default 100%
}

/**
 * Validate that all required values exist for WHS calculation
 */
export function validateWHSInputs(
  handicapIndex: number | undefined,
  teeSet: TeeSet | null,
  allowancePercent: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (handicapIndex === undefined || handicapIndex === null) {
    errors.push("Handicap Index is required");
  }

  const teeValidation = validateTeeSet(teeSet);
  if (!teeValidation.valid) {
    errors.push(teeValidation.error || "Tee set is invalid");
  }

  if (typeof allowancePercent !== "number" || allowancePercent < 0 || allowancePercent > 100) {
    errors.push("Handicap allowance must be between 0 and 100%");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get playing handicap for a member in an event using WHS formula
 * 
 * WHS Formula:
 * - Course Handicap = round(HI × (Slope Rating / 113) + (Course Rating − Par))
 * - Playing Handicap = round(Course Handicap × (Handicap Allowance % / 100))
 * 
 * @param member - Member data with handicap and sex
 * @param event - Event data with allowance settings
 * @param course - Course data (optional, for validation)
 * @param maleTeeSet - Male tee set
 * @param femaleTeeSet - Female tee set
 * @returns Playing handicap or null if calculation not possible
 */
export function getPlayingHandicap(
  member: MemberData | { id: string; name: string; handicap?: number; sex?: "male" | "female" },
  event: EventData | null,
  course: Course | null,
  maleTeeSet: TeeSet | null,
  femaleTeeSet: TeeSet | null
): number | null {
  // Member must have handicap index
  if (member.handicap === undefined || member.handicap === null) {
    return null;
  }

  // Get appropriate tee set based on sex (defaults to male if sex missing)
  const teeSet = getTeeSetForPlayer(member.sex, maleTeeSet, femaleTeeSet);
  if (!teeSet) {
    return null;
  }

  // Get allowance from event
  const allowancePercent = getEventAllowancePercent(event);

  // Calculate playing handicap using WHS formula
  return calculatePlayingHandicapFromIndex(member.handicap, teeSet, allowancePercent);
}

/**
 * Get playing handicap for a guest
 */
export function getGuestPlayingHandicap(
  guest: GuestData | { id: string; name: string; handicapIndex?: number; sex: "male" | "female" },
  event: EventData | null,
  maleTeeSet: TeeSet | null,
  femaleTeeSet: TeeSet | null
): number | null {
  if (guest.handicapIndex === undefined || guest.handicapIndex === null) {
    return null;
  }

  const teeSet = getTeeSetForPlayer(guest.sex, maleTeeSet, femaleTeeSet);
  if (!teeSet) {
    return null;
  }

  const allowancePercent = getEventAllowancePercent(event);
  return calculatePlayingHandicapFromIndex(guest.handicapIndex, teeSet, allowancePercent);
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

  const teeSet = getTeeSetForPlayer(member.sex, maleTeeSet, femaleTeeSet);
  if (!teeSet) {
    return null;
  }

  return whsCalculateCourseHandicap(member.handicap, teeSet);
}

/**
 * Calculate playing handicap with strict validation
 * Throws WHSCalculationError if any required value is missing
 */
export function getPlayingHandicapStrict(
  member: MemberData,
  event: EventData,
  maleTeeSet: TeeSet | null,
  femaleTeeSet: TeeSet | null
): number {
  if (member.handicap === undefined || member.handicap === null) {
    throw new WHSCalculationError("Member handicap index is required", "handicap");
  }

  if (!member.sex) {
    throw new WHSCalculationError("Member sex is required for tee set selection", "sex");
  }

  const teeSet = getTeeSetForPlayer(member.sex, maleTeeSet, femaleTeeSet);
  if (!teeSet) {
    throw new WHSCalculationError(
      `${member.sex === "male" ? "Male" : "Female"} tee set is required`,
      "teeSet"
    );
  }

  const teeValidation = validateTeeSet(teeSet);
  if (!teeValidation.valid) {
    throw new WHSCalculationError(teeValidation.error || "Invalid tee set", "teeSet");
  }

  const allowancePercent = getEventAllowancePercent(event);
  const result = calculatePlayingHandicapFromIndex(member.handicap, teeSet, allowancePercent);

  if (result === null) {
    throw new WHSCalculationError("Failed to calculate playing handicap", "calculation");
  }

  return result;
}
