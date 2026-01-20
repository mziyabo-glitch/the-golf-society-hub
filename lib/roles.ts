/**
 * Role management utilities
 *
 * FIX:
 * - Normalize roles to lowercase internally so RBAC works even if Firestore contains:
 *   ["Captain","Member"] or ["captain","member"] or mixed.
 */

import { ensureSignedIn } from "@/lib/firebase";
import { getUserDoc } from "@/lib/db/userRepo";
import { getMemberDoc, listMembersBySociety } from "@/lib/db/memberRepo";

export type MemberRole = "captain" | "treasurer" | "secretary" | "handicapper" | "member" | "admin";

export type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  roles?: string[];
};

const ROLE_CANONICAL: Record<string, MemberRole> = {
  // lowercase
  captain: "captain",
  treasurer: "treasurer",
  secretary: "secretary",
  handicapper: "handicapper",
  member: "member",
  admin: "admin",

  // Title Case (legacy)
  Captain: "captain",
  Treasurer: "treasurer",
  Secretary: "secretary",
  Handicapper: "handicapper",
  Member: "member",
  Admin: "admin",
};

export function normalizeRoleString(raw: unknown): MemberRole | null {
  if (typeof raw !== "string") return null;
  const direct = ROLE_CANONICAL[raw];
  if (direct) return direct;

  const lower = raw.toLowerCase();
  return (ROLE_CANONICAL[lower] ?? null) as MemberRole | null;
}

export function normalizeRolesArray(raw: unknown): MemberRole[] {
  const set = new Set<MemberRole>();
  set.add("member");

  if (!Array.isArray(raw)) return Array.from(set);

  for (const r of raw) {
    const normalized = normalizeRoleString(r);
    if (normalized) set.add(normalized);
  }

  return Array.from(set);
}

/**
 * SYNC helper: Check if a member object has a specific role.
 */
export function hasRole(member: MemberData | null, role: MemberRole): boolean {
  if (!member) return false;
  const roles = normalizeRolesArray(member.roles);
  return roles.includes(role);
}

/**
 * Check if member is admin-like (captain OR admin)
 */
export function isAdminLike(member: MemberData | null): boolean {
  if (!member) return false;
  const roles = normalizeRolesArray(member.roles);
  return roles.includes("captain") || roles.includes("admin");
}

/**
 * Get member data by ID
 */
export async function getMemberById(memberId: string): Promise<MemberData | null> {
  try {
    const member = await getMemberDoc(memberId);
    if (!member) return null;
    return {
      ...member,
      roles: normalizeRolesArray(member.roles),
    };
  } catch (error) {
    console.error("Error loading member:", error);
    return null;
  }
}

/**
 * Get all members
 */
export async function getAllMembers(): Promise<MemberData[]> {
  try {
    const uid = await ensureSignedIn();
    const user = await getUserDoc(uid);
    if (!user?.activeSocietyId) return [];
    const members = await listMembersBySociety(user.activeSocietyId);
    return members.map((m) => ({
      ...m,
      roles: normalizeRolesArray(m.roles),
    }));
  } catch (error) {
    console.error("Error loading members:", error);
    return [];
  }
}

/**
 * Get current user's member data
 */
export async function getCurrentMember(): Promise<MemberData | null> {
  const uid = await ensureSignedIn();
  const user = await getUserDoc(uid);
  if (!user?.activeMemberId) return null;
  return await getMemberById(user.activeMemberId);
}

/**
 * Get current user's roles
 */
export async function getCurrentUserRoles(): Promise<MemberRole[]> {
  const member = await getCurrentMember();
  if (!member) return ["member"];
  return normalizeRolesArray(member.roles);
}

/**
 * ASYNC helper: Check if the current logged-in user has a specific role.
 */
export async function currentUserHasRole(role: MemberRole): Promise<boolean> {
  const roles = await getCurrentUserRoles();
  return roles.includes(role);
}

/**
 * Check if user has any of the specified roles
 */
export async function hasAnyRole(rolesToCheck: MemberRole[]): Promise<boolean> {
  const roles = await getCurrentUserRoles();
  return rolesToCheck.some((role) => roles.includes(role));
}

/**
 * Check if user has ManCo role
 */
export async function hasManCoRole(): Promise<boolean> {
  return hasAnyRole(["captain", "treasurer", "secretary", "handicapper", "admin"]);
}

/**
 * Check if user can create events (captain or admin)
 */
export async function canCreateEvents(): Promise<boolean> {
  return hasAnyRole(["captain", "admin"]);
}

/**
 * Check if user can assign roles (captain or admin)
 */
export async function canAssignRoles(): Promise<boolean> {
  return hasAnyRole(["captain", "admin"]);
}

/**
 * Check if user can view finance (treasurer, captain, admin)
 */
export async function canViewFinance(): Promise<boolean> {
  return hasAnyRole(["treasurer", "captain", "admin"]);
}

/**
 * Check if user can edit venue info (secretary, captain, admin)
 */
export async function canEditVenueInfo(): Promise<boolean> {
  return hasAnyRole(["secretary", "captain", "admin"]);
}

/**
 * Check if user can edit handicaps/results (handicapper, captain, admin)
 */
export async function canEditHandicaps(): Promise<boolean> {
  return hasAnyRole(["handicapper", "captain", "admin"]);
}
