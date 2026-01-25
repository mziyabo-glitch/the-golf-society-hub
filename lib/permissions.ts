// lib/permissions.ts
/**
 * Compatibility permissions layer.
 *
 * Your app screens currently use the legacy signature:
 *   canX(sessionRole, memberRoles)
 *   normalizeSessionRole("member")
 *   normalizeMemberRoles(member?.roles)
 *
 * Your Settings screen uses the newer signature:
 *   canResetSociety(member)
 *
 * This file supports BOTH without breaking anything.
 */

export type SessionRole = "admin" | "member";

export type Permissions = {
  // Society-level
  canResetSociety: boolean;

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
  canManageTeeSheet: boolean;

  // Finance / P&L
  canAccessFinance: boolean;
  canManageMembershipFees: boolean;
  canManageEventPayments: boolean;
  canManageEventExpenses: boolean;

  // Handicaps
  canManageHandicaps: boolean;
};

export type MemberLike = {
  id?: string;
  uid?: string;
  roles?: string[];
};

/**
 * Normalize roles from Firestore:
 * - accepts ["Captain","member"] etc
 * - returns lowercase canonical roles
 * - always includes "member"
 */
export function normalizeMemberRoles(raw: unknown): string[] {
  const set = new Set<string>();
  set.add("member");

  if (!Array.isArray(raw)) return Array.from(set);

  for (const r of raw) {
    if (typeof r !== "string") continue;
    const lower = r.toLowerCase().trim();
    if (!lower) continue;

    // Canonicalize known roles
    if (lower === "captain") set.add("captain");
    else if (lower === "treasurer") set.add("treasurer");
    else if (lower === "secretary") set.add("secretary");
    else if (lower === "handicapper") set.add("handicapper");
    else if (lower === "admin") set.add("admin");
    else if (lower === "member") set.add("member");
    else set.add(lower); // keep unknowns (future-proof)
  }

  return Array.from(set);
}

/**
 * Legacy session role normalizer.
 * Many screens call normalizeSessionRole("member")
 */
export function normalizeSessionRole(raw: unknown): SessionRole {
  if (typeof raw !== "string") return "member";
  const v = raw.toLowerCase().trim();
  return v === "admin" ? "admin" : "member";
}

function isAdmin(sessionRole: SessionRole, roles: string[]) {
  return sessionRole === "admin" || roles.includes("admin") || roles.includes("captain");
}

function hasAnyRole(roles: string[], wanted: string[]) {
  return wanted.some((r) => roles.includes(r));
}

function getRoleFlags(roles: string[]) {
  return {
    captain: roles.includes("captain") || roles.includes("admin"),
    treasurer: roles.includes("treasurer"),
    secretary: roles.includes("secretary"),
    handicapper: roles.includes("handicapper"),
  };
}

/**
 * ---- Legacy helpers used across app screens ----
 * Signature: (sessionRole, roles)
 */
export function canManageMembers(sessionRole: SessionRole, roles: string[]) {
  const r = normalizeMemberRoles(roles);
  return isAdmin(sessionRole, r) || hasAnyRole(r, ["treasurer"]);
}

export function canAssignRoles(sessionRole: SessionRole, roles: string[]) {
  const r = normalizeMemberRoles(roles);
  // Captain/admin only
  return isAdmin(sessionRole, r);
}

export function canCreateEvents(sessionRole: SessionRole, roles: string[]) {
  const r = normalizeMemberRoles(roles);
  // Captain or Secretary can create/manage event setup
  return isAdmin(sessionRole, r) || hasAnyRole(r, ["secretary"]);
}

export function canViewFinance(sessionRole: SessionRole, roles: string[]) {
  const r = normalizeMemberRoles(roles);
  // Captain or Treasurer
  return isAdmin(sessionRole, r) || hasAnyRole(r, ["treasurer"]);
}

export function canManageCompetition(sessionRole: SessionRole, roles: string[]) {
  const r = normalizeMemberRoles(roles);
  // Handicapper or Captain
  return isAdmin(sessionRole, r) || hasAnyRole(r, ["handicapper"]);
}

export function canEditHandicaps(sessionRole: SessionRole, roles: string[]) {
  const r = normalizeMemberRoles(roles);
  return isAdmin(sessionRole, r) || hasAnyRole(r, ["handicapper"]);
}

export function canEnterScores(sessionRole: SessionRole, roles: string[]) {
  const r = normalizeMemberRoles(roles);
  return isAdmin(sessionRole, r) || hasAnyRole(r, ["handicapper"]);
}

export function canEditVenueInfo(sessionRole: SessionRole, roles: string[]) {
  const r = normalizeMemberRoles(roles);
  // Secretary or Captain
  return isAdmin(sessionRole, r) || hasAnyRole(r, ["secretary"]);
}

/**
 * ---- Canonical permissions for current member ----
 * Signature: (currentMember)
 */
export function getPermissionsForMember(
  currentMember: MemberLike | null | undefined
): Permissions {
  const roles = normalizeMemberRoles(currentMember?.roles);
  const { captain, treasurer, secretary, handicapper } = getRoleFlags(roles);

  return {
    // Society-level
    canResetSociety: captain || treasurer,

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
    canUploadTeeSheet: captain || handicapper || secretary,
    canManageTeeSheet: captain || handicapper || secretary,

    // Finance / P&L
    canAccessFinance: captain || treasurer,
    canManageMembershipFees: captain || treasurer,
    canManageEventPayments: captain || treasurer,
    canManageEventExpenses: captain || treasurer,

    // Handicaps
    canManageHandicaps: captain || handicapper,
  };
}

/**
 * ---- Newer helper used by Settings screen ----
 * Signature: (currentMember)
 */
export function canResetSociety(currentMember: any) {
  const roles = normalizeMemberRoles(currentMember?.roles);
  // Captain or Treasurer can reset
  return roles.includes("captain") || roles.includes("treasurer") || roles.includes("admin");
}
