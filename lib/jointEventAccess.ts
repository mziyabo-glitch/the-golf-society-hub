/**
 * Joint event visibility: event_societies is the source of truth (not events.guest_society_id
 * or raw events.is_joint_event from an unenriched row).
 */

export function isActiveSocietyParticipantForEvent(
  activeSocietyId: string | null | undefined,
  hostSocietyId: string | null | undefined,
  participantSocietyIds: readonly string[] | null | undefined,
): boolean {
  if (!activeSocietyId || !hostSocietyId) return false;
  const a = String(activeSocietyId);
  if (a === String(hostSocietyId)) return true;
  const list = participantSocietyIds ?? [];
  if (list.length === 0) return false;
  return list.some((x) => String(x) === a);
}

/** True when event_societies indicates a joint event (≥2 distinct societies). */
export function isJointEventFromMeta(
  participantSocietyIds: readonly string[] | null | undefined,
  linkedSocietyCount?: number | null,
): boolean {
  if (typeof linkedSocietyCount === "number" && linkedSocietyCount >= 2) return true;
  return (participantSocietyIds?.length ?? 0) >= 2;
}
