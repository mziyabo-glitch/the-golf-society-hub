/**
 * HOW TO TEST:
 * - Set member roles via Settings → Roles & Permissions
 * - Confirm member can't create event (should show alert and redirect)
 * - Confirm captain can create/edit events
 * - Confirm secretary can edit venue notes only
 * - Confirm handicapper can access results/handicaps
 * - Verify role badge shows on dashboard
 */

/**
 * Role management utilities
 * Manages member roles: captain, treasurer, secretary, handicapper, member, admin
 */

import { ensureSignedIn } from "@/lib/firebase";
import { getUserDoc } from "@/lib/db/userRepo";
import { getMemberDoc, listMembersBySociety } from "@/lib/db/memberRepo";

export type MemberRole = "captain" | "treasurer" | "secretary" | "handicapper" | "member" | "admin";


export type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  roles?: string[]; // Array of roles (member can have multiple) - using string[] for compatibility
};


/**
 * SYNC helper: Check if a member object has a specific role.
 * Use this when you already have a MemberData object.
 * 
 * Example: hasRole(member, "captain")
 */
export function hasRole(member: MemberData | null, role: MemberRole): boolean {
  if (!member) return false;
  if (!member.roles || member.roles.length === 0) return role === "member";
  return member.roles.includes(role);
}

/**
 * Check if member is admin-like (captain OR legacy admin flag)
 */
export function isAdminLike(member: MemberData | null): boolean {
  if (!member) return false;
  if (!member.roles || member.roles.length === 0) return false;
  return member.roles.includes("captain") || member.roles.includes("admin");
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
      roles: member.roles && member.roles.length > 0 ? member.roles : ["member"],
    };
  } catch (error) {
    console.error("Error loading member:", error);
    return null;
  }
}

/**
 * Get all members with migration
 */
export async function getAllMembers(): Promise<MemberData[]> {
  try {
    const uid = await ensureSignedIn();
    const user = await getUserDoc(uid);
    if (!user?.activeSocietyId) return [];
    const members = await listMembersBySociety(user.activeSocietyId);
    return members.map((m) => ({
      ...m,
      roles: m.roles && m.roles.length > 0 ? m.roles : ["member"],
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
export async function getCurrentUserRoles(): Promise<string[]> {
  const member = await getCurrentMember();
  if (!member) return ["member"];
  return member.roles && member.roles.length > 0 ? member.roles : ["member"];
}

/**
 * ASYNC helper: Check if the current logged-in user has a specific role.
 * This loads the current user from session and checks their roles.
 * 
 * Use this for permission checks in screens/components.
 * Example: if (await currentUserHasRole("captain")) { ... }
 * 
 * For checking a specific member object, use the sync hasRole(member, role) instead.
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
 * Check if user has ManCo role (captain, treasurer, secretary, handicapper, admin)
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

