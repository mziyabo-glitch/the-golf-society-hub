/**
 * Client-side tee sheet manage authorization for cross-society / deep-link protection.
 * Mirrors server `can_manage_event_tee_sheet` intent; RLS remains authoritative for writes.
 */

import { canManageEventPaymentsForSociety } from "@/lib/rbac";

export type TeeSheetManageMembership = {
  societyId: string;
  role: string;
};

export type TeeSheetManageAccessInput = {
  userId: string | null | undefined;
  memberships: readonly TeeSheetManageMembership[];
  participantSocietyIds: readonly string[];
  hostSocietyId: string | null | undefined;
  isPlatformAdmin: boolean;
};

export type TeeSheetManageAccessDeniedReason =
  | "unauthenticated"
  | "not_participating_manco"
  | "not_manco";

export type TeeSheetManageAccessResult =
  | { allowed: true; via: "platform_admin" | "participating_manco" }
  | { allowed: false; reason: TeeSheetManageAccessDeniedReason };

export const TEE_SHEET_ACCESS_DENIED_MESSAGE =
  "You do not have permission to manage this event";

/** Societies linked to an event (participants, else host). */
export function linkedEventSocietyIds(
  participantSocietyIds: readonly string[],
  hostSocietyId: string | null | undefined,
): string[] {
  const fromParticipants = [...new Set(participantSocietyIds.filter(Boolean).map(String))];
  if (fromParticipants.length > 0) return fromParticipants;
  if (hostSocietyId) return [String(hostSocietyId)];
  return [];
}

/** Whether the user may load or edit the tee sheet for this event. */
export function resolveTeeSheetManageAccess(
  input: TeeSheetManageAccessInput,
): TeeSheetManageAccessResult {
  if (!input.userId) {
    return { allowed: false, reason: "unauthenticated" };
  }

  if (input.isPlatformAdmin) {
    return { allowed: true, via: "platform_admin" };
  }

  const linked = linkedEventSocietyIds(input.participantSocietyIds, input.hostSocietyId);
  if (linked.length === 0) {
    return { allowed: false, reason: "not_participating_manco" };
  }

  const linkedSet = new Set(linked);
  const participates = input.memberships.some((m) => linkedSet.has(String(m.societyId)));
  if (!participates) {
    return { allowed: false, reason: "not_participating_manco" };
  }

  const hasMancoInLinked = linked.some((societyId) =>
    canManageEventPaymentsForSociety(input.memberships, societyId),
  );
  if (!hasMancoInLinked) {
    return { allowed: false, reason: "not_manco" };
  }

  return { allowed: true, via: "participating_manco" };
}

export function canPersistTeeSheetForEvent(access: TeeSheetManageAccessResult | null): boolean {
  return access?.allowed === true;
}
