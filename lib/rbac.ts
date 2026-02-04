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
  canManageEventExpenses: boolean;

  // Handicaps
  canManageHandicaps: boolean;
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
  const manco = isManCo(currentMember);

  return {
    // Society-level
    canResetSociety: captain || treasurer,
    canManageSocietyLogo: captain || secretary,

    // Members
    canCreateMembers: captain || treasurer,
    canEditMembers: captain || treasurer,
    canDeleteMembers: captain || treasurer,
    canEditOwnProfile: true,

    // Roles
    canManageRoles: captain,

    // Events / tee sheets
    canCreateEvents: captain || secretary || handicapper,
    canEditEvents: captain || secretary || handicapper,
    canDeleteEvents: captain,
    canUploadTeeSheet: captain || handicapper,
    canGenerateTeeSheet: captain || secretary || handicapper,

    // Finance / P&L
    canAccessFinance: captain || treasurer,
    canManageMembershipFees: captain || treasurer,
    canManageEventPayments: captain || treasurer,
    canManageEventExpenses: captain || treasurer,

    // Handicaps
    canManageHandicaps: captain || handicapper,
  };
};

/**
 * Convenience helpers (keep call-sites readable)
 */
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
};
