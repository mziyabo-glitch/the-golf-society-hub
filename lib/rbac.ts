// lib/rbac.ts
/**
 * RBAC helpers for the Golf Society Hub
 *
 * This file centralizes what each role can do.
 * IMPORTANT: Permissions are determined from the CURRENT logged-in member,
 * not the "target" member being viewed/edited.
 */

export type Role =
  | "CAPTAIN"
  | "TREASURER"
  | "SECRETARY"
  | "HANDICAPPER"
  | "MEMBER";

export type Permissions = {
  // Society-level
  canResetSociety: boolean;
  canManageSocietyLogo: boolean;

  // Members
  canCreateMembers: boolean;
  canEditMembers: boolean;
  canDeleteMembers: boolean;
  canEditOwnProfile: boolean;

  // Roles
  canManageRoles: boolean;

  // Events / tee sheets
  canCreateEvents: boolean;
  canEditEvents: boolean;
  canDeleteEvents: boolean;
  canUploadTeeSheet: boolean;
  canGenerateTeeSheet: boolean;

  // Finance / P&L
  canAccessFinance: boolean;
  canManageMembershipFees: boolean;
  canManageEventPayments: boolean;
  /** Captain / Treasurer / Secretary only — payment list share & PDF (not Handicapper). */
  canShareEventPaymentLists: boolean;
  canManageEventExpenses: boolean;

  // Handicaps
  canManageHandicaps: boolean;

  // OOM Roll of Honour
  canManageOomChampions: boolean;

  /** Birdies League (Captain / Handicapper — same authority as official results). */
  canManageBirdiesLeague: boolean;
};

export type MemberLike = {
  id: string;
  uid?: string;
  roles?: Role[] | string[];
  role?: Role | string;
};

const normalizeRoles = (roles?: Role[] | string[] | string) => {
  const r = Array.isArray(roles) ? roles : roles ? [roles] : [];
  // Convert to uppercase to handle lowercase roles from database
  const normalized = r.map((role) => role.toUpperCase() as Role);
  return normalized.length ? normalized : (["MEMBER"] as Role[]);
};

export const hasRole = (member: MemberLike | null | undefined, role: Role) => {
  const roles = normalizeRoles(member?.roles ?? member?.role);
  return roles.includes(role);
};

export const isCaptain = (member: MemberLike | null | undefined) =>
  hasRole(member, "CAPTAIN");

export const isTreasurer = (member: MemberLike | null | undefined) =>
  hasRole(member, "TREASURER");

export const isSecretary = (member: MemberLike | null | undefined) =>
  hasRole(member, "SECRETARY");

export const isHandicapper = (member: MemberLike | null | undefined) =>
  hasRole(member, "HANDICAPPER");

export const isManCo = (member: MemberLike | null | undefined) => {
  const roles = normalizeRoles(member?.roles ?? member?.role);
  return roles.some((r) =>
    ["CAPTAIN", "TREASURER", "SECRETARY", "HANDICAPPER"].includes(r)
  );
};

/**
 * Compute permissions for the CURRENT logged-in member.
 * (Previously this was accidentally derived from the "target member" and also
 * referenced a non-existent `session` object.)
 */
export const getPermissionsForMember = (
  currentMember: MemberLike | null | undefined
): Permissions => {
  const captain = isCaptain(currentMember);
  const treasurer = isTreasurer(currentMember);
  const secretary = isSecretary(currentMember);
  const handicapper = isHandicapper(currentMember);

  return {
    // Society-level
    canResetSociety: captain || treasurer,
    canManageSocietyLogo: captain,

    // Members (placeholders / pre-app members: full ManCo can add)
    canCreateMembers: captain || treasurer || secretary || handicapper,
    canEditMembers: captain || treasurer,
    canDeleteMembers: captain || secretary || treasurer,
    canEditOwnProfile: true,

    // Roles
    canManageRoles: captain,

    // Events / tee sheets
    canCreateEvents: captain || secretary || handicapper,
    canEditEvents: captain || secretary || handicapper,
    canDeleteEvents: captain || secretary || treasurer,
    canUploadTeeSheet: captain || handicapper,
    canGenerateTeeSheet: captain || secretary || handicapper,

    // Finance / P&L
    canAccessFinance: captain || treasurer,
    canManageMembershipFees: captain || treasurer,
    canManageEventPayments: captain || treasurer || secretary || handicapper,
    canShareEventPaymentLists: captain || treasurer || secretary,
    canManageEventExpenses: captain || treasurer,

    // Handicaps
    canManageHandicaps: captain || handicapper,

    // OOM Roll of Honour (Captain/Secretary)
    canManageOomChampions: captain || secretary,

    canManageBirdiesLeague: captain || handicapper,
  };
};

/**
 * Convenience helpers (keep call-sites readable)
 */
/** Captain/Treasurer/Secretary/Handicapper in a specific society (from memberships list — avoids wrong row when user is in multiple clubs). */
export function canManageEventPaymentsForSociety(
  memberships: { societyId: string; role: string }[] | null | undefined,
  activeSocietyId: string | null | undefined,
): boolean {
  if (!activeSocietyId || !memberships?.length) return false;
  const m = memberships.find((x) => x.societyId === activeSocietyId);
  if (!m) return false;
  const r = String(m.role || "").toUpperCase();
  return (
    r === "CAPTAIN" ||
    r === "TREASURER" ||
    r === "SECRETARY" ||
    r === "HANDICAPPER"
  );
}

/** Captain / Treasurer / Secretary in the active society — payment share / PDF only. */
export function canShareEventPaymentListsForSociety(
  memberships: { societyId: string; role: string }[] | null | undefined,
  activeSocietyId: string | null | undefined,
): boolean {
  if (!activeSocietyId || !memberships?.length) return false;
  const m = memberships.find((x) => x.societyId === activeSocietyId);
  if (!m) return false;
  const r = String(m.role || "").toUpperCase();
  return r === "CAPTAIN" || r === "TREASURER" || r === "SECRETARY";
}

/** Same roles as `mark_event_paid` / `admin_add_member_to_event` (per active society membership). */
export function canManageEventRosterForSociety(
  memberships: { societyId: string; role: string }[] | null | undefined,
  activeSocietyId: string | null | undefined,
): boolean {
  return canManageEventPaymentsForSociety(memberships, activeSocietyId);
}

/**
 * Captain in at least one society linked to the event (participant list, else host, else active society).
 * Matches server checks for prize pool availability and manager assignment.
 */
export function isCaptainInLinkedSocietiesForEvent(
  memberships: { societyId: string; role: string }[] | null | undefined,
  participantSocietyIds: string[],
  hostSocietyId: string | null | undefined,
  activeSocietyFallback: string | null | undefined,
): boolean {
  const fromParticipants = [...new Set(participantSocietyIds.filter(Boolean))];
  const linked =
    fromParticipants.length > 0
      ? fromParticipants
      : hostSocietyId
        ? [hostSocietyId]
        : activeSocietyFallback
          ? [activeSocietyFallback]
          : [];
  if (!memberships?.length || !linked.length) return false;
  const set = new Set(linked);
  return memberships.some(
    (m) => set.has(m.societyId) && String(m.role || "").toUpperCase() === "CAPTAIN",
  );
}

/**
 * Captain or Secretary in at least one society linked to the event.
 * Used for invite sharing and prize-pool manager assignment visibility on event detail.
 */
export function isCaptainOrSecretaryInLinkedSocietiesForEvent(
  memberships: { societyId: string; role: string }[] | null | undefined,
  participantSocietyIds: string[],
  hostSocietyId: string | null | undefined,
  activeSocietyFallback: string | null | undefined,
): boolean {
  const fromParticipants = [...new Set(participantSocietyIds.filter(Boolean))];
  const linked =
    fromParticipants.length > 0
      ? fromParticipants
      : hostSocietyId
        ? [hostSocietyId]
        : activeSocietyFallback
          ? [activeSocietyFallback]
          : [];
  if (!memberships?.length || !linked.length) return false;
  const set = new Set(linked);
  return memberships.some((m) => {
    const role = String(m.role || "").toUpperCase();
    return set.has(m.societyId) && (role === "CAPTAIN" || role === "SECRETARY");
  });
}

export const can = {
  resetSociety: (currentMember: MemberLike | null | undefined) =>
    getPermissionsForMember(currentMember).canResetSociety,

  manageRoles: (currentMember: MemberLike | null | undefined) =>
    getPermissionsForMember(currentMember).canManageRoles,

  manageMembers: (currentMember: MemberLike | null | undefined) => {
    const p = getPermissionsForMember(currentMember);
    return p.canCreateMembers || p.canEditMembers || p.canDeleteMembers;
  },

  accessFinance: (currentMember: MemberLike | null | undefined) =>
    getPermissionsForMember(currentMember).canAccessFinance,

  manageEventPnl: (currentMember: MemberLike | null | undefined) => {
    const p = getPermissionsForMember(currentMember);
    return p.canManageEventPayments || p.canManageEventExpenses;
  },

  manageHandicaps: (currentMember: MemberLike | null | undefined) =>
    getPermissionsForMember(currentMember).canManageHandicaps,

  manageOomChampions: (currentMember: MemberLike | null | undefined) =>
    getPermissionsForMember(currentMember).canManageOomChampions,
};
