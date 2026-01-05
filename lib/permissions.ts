/**
 * Permission checking utilities (PURE FUNCTIONS)
 *
 * Single source of truth for permissions. Screens are responsible for loading
 * session + current member roles, then calling these helpers.
 *
 * NOTE: Our stored data historically used lowercase roles (e.g. "captain").
 * These helpers normalize both legacy lowercase and new Title Case roles.
 */

export type SessionRole = "ADMIN" | "MEMBER";
export type MemberRole = "Captain" | "Treasurer" | "Secretary" | "Handicapper" | "Member";

/**
 * Normalize session role coming from storage ("admin"/"member") or UI ("ADMIN"/"MEMBER")
 * into the canonical SessionRole used by permission helpers.
 */
export function normalizeSessionRole(role: unknown): SessionRole {
  if (role === "ADMIN" || role === "MEMBER") return role;
  if (role === "admin") return "ADMIN";
  return "MEMBER";
}

const ROLE_MAP: Record<string, MemberRole> = {
  captain: "Captain",
  treasurer: "Treasurer",
  secretary: "Secretary",
  handicapper: "Handicapper",
  member: "Member",

  // Legacy/experimental role values in some local data sets:
  // Treat "admin" as Captain-equivalent for permissions.
  admin: "Captain",

  // Title Case passthroughs
  Captain: "Captain",
  Treasurer: "Treasurer",
  Secretary: "Secretary",
  Handicapper: "Handicapper",
  Member: "Member",
};

/**
 * Normalize stored member roles (unknown input; possibly lowercase strings) into MemberRole[].
 * Always includes "Member" at minimum.
 */
export function normalizeMemberRoles(rawRoles: unknown): MemberRole[] {
  const out = new Set<MemberRole>();
  out.add("Member");

  if (!Array.isArray(rawRoles)) return Array.from(out);

  for (const r of rawRoles) {
    if (typeof r !== "string") continue;
    const mapped = ROLE_MAP[r];
    if (mapped) out.add(mapped);
  }

  return Array.from(out);
}

export function canManageMembers(sessionRole: SessionRole, roles: MemberRole[]): boolean {
  if (sessionRole === "ADMIN") return true;
  return roles.includes("Captain") || roles.includes("Secretary");
}

export function canCreateEvents(sessionRole: SessionRole, roles: MemberRole[]): boolean {
  if (sessionRole === "ADMIN") return true;
  return roles.includes("Captain") || roles.includes("Secretary");
}

export function canAssignRoles(sessionRole: SessionRole, roles: MemberRole[]): boolean {
  if (sessionRole === "ADMIN") return true;
  return roles.includes("Captain"); // Captain only
}

// ---- additional permissions used elsewhere in the app (same pattern) ----

export function canViewFinance(sessionRole: SessionRole, roles: MemberRole[]): boolean {
  if (sessionRole === "ADMIN") return true;
  return roles.includes("Captain") || roles.includes("Treasurer");
}

export function canEditVenueInfo(sessionRole: SessionRole, roles: MemberRole[]): boolean {
  if (sessionRole === "ADMIN") return true;
  return roles.includes("Captain") || roles.includes("Secretary");
}

export function canEditHandicaps(sessionRole: SessionRole, roles: MemberRole[]): boolean {
  if (sessionRole === "ADMIN") return true;
  return roles.includes("Captain") || roles.includes("Handicapper");
}

export function canEditResults(sessionRole: SessionRole, roles: MemberRole[]): boolean {
  if (sessionRole === "ADMIN") return true;
  return roles.includes("Captain") || roles.includes("Handicapper") || roles.includes("Secretary");
}

export function canManageCompetition(sessionRole: SessionRole, roles: MemberRole[]): boolean {
  if (sessionRole === "ADMIN") return true;
  return roles.includes("Captain") || roles.includes("Handicapper") || roles.includes("Secretary");
}

/**
 * @deprecated Back-compat alias for older code that used `canEditMembers`.
 * Prefer `canManageMembers(sessionRole, roles)`.
 */
export function canEditMembers(sessionRole: SessionRole, roles: MemberRole[]): boolean {
  return canManageMembers(sessionRole, roles);
}
