/**
 * Phase 2 Joint Events: Dev-only debug helpers.
 * Use for validating payloads and catching blank-screen issues.
 */

import type { JointEventDetail } from "./jointEventTypes";

const ENABLED = __DEV__;

/**
 * Log raw and normalized joint event payload for debugging.
 * Call after getJointEventDetail to inspect the response.
 */
export function logJointEventPayload(
  eventId: string,
  raw: unknown,
  normalized: JointEventDetail | null,
  pathUsed: "joint" | "standard"
): void {
  if (!ENABLED) return;
  console.log("[jointEvent:debug]", {
    eventId,
    pathUsed,
    hasNormalized: !!normalized,
    eventTitle: normalized?.event?.title ?? null,
    isJoint: normalized?.event?.is_joint_event ?? null,
    societiesCount: normalized?.participating_societies?.length ?? 0,
    entriesCount: normalized?.entries?.length ?? 0,
    rawKeys: raw && typeof raw === "object" ? Object.keys(raw as object) : [],
  });
}

/**
 * Validate that a joint payload has required structure.
 * Returns true if valid; logs warnings if not.
 */
export function validateJointEventPayload(payload: unknown): payload is JointEventDetail {
  if (!payload || typeof payload !== "object") {
    if (ENABLED) console.warn("[jointEvent:validate] payload is null or not object");
    return false;
  }
  const p = payload as Record<string, unknown>;
  if (!p.event || typeof p.event !== "object") {
    if (ENABLED) console.warn("[jointEvent:validate] missing or invalid event");
    return false;
  }
  const ev = p.event as Record<string, unknown>;
  if (!ev.id || !ev.title) {
    if (ENABLED) console.warn("[jointEvent:validate] event missing id or title");
    return false;
  }
  if (!Array.isArray(p.participating_societies)) {
    if (ENABLED) console.warn("[jointEvent:validate] participating_societies not array");
    return false;
  }
  if (!Array.isArray(p.entries)) {
    if (ENABLED) console.warn("[jointEvent:validate] entries not array");
    return false;
  }
  return true;
}
