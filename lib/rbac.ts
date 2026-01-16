/**
 * Centralized RBAC (Role-Based Access Control)
 * Single source of truth for all permissions
 * 
 * Inputs: session (current user), members list, optional society config
 * Output: Permissions object with boolean flags
 */

import { ensureSignedIn } from "@/lib/firebase";
import { getUserDoc } from "@/lib/db/userRepo";
import { getMemberDoc } from "@/lib/db/memberRepo";
import { normalizeMemberRoles, type MemberRole, type SessionRole } from "./permissions";

export type Permissions = {
  canManageRoles: boolean;        // Captain only
  canManageMembers: boolean;       // Captain or Treasurer
  canManageEvents: boolean;        // Captain or Secretary
  canManageTeeSheet: boolean;      // Captain or Handicapper
  canManageHandicaps: boolean;     // Captain or Handicapper
  canManageFinance: boolean;       // Captain or Treasurer
  canEnterResults: boolean;         // Captain, Secretary, or Handicapper
  canEditOwnProfile: boolean;       // All signed-in members
  isCaptain: boolean;               // Is Captain
  isTreasurer: boolean;             // Is Treasurer
  isSecretary: boolean;             // Is Secretary
  isHandicapper: boolean;           // Is Handicapper
};

function sessionRoleFromRoles(roles: MemberRole[]): SessionRole {
  if (roles.includes("Captain")) {
    return "ADMIN";
  }
  return "MEMBER";
}

/**
 * Get current user's permissions
 * Returns all false if not loaded yet (safe default)
 */
export async function getPermissions(): Promise<Permissions> {
  try {
    const uid = await ensureSignedIn();
    const user = await getUserDoc(uid);
    if (!user?.activeMemberId) {
      return getDefaultPermissions();
    }

    const member = await getMemberDoc(user.activeMemberId);
    if (!member) {
      return getDefaultPermissions();
    }

    const roles = normalizeMemberRoles(member.roles);
    const sessionRole = sessionRoleFromRoles(roles);

    return {
      canManageRoles: sessionRole === "ADMIN" || roles.includes("Captain"),
      canManageMembers: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Treasurer"),
      canManageEvents: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Secretary"),
      canManageTeeSheet: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Handicapper"),
      canManageHandicaps: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Handicapper"),
      canManageFinance: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Treasurer"),
      canEnterResults: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Secretary") || roles.includes("Handicapper"),
      canEditOwnProfile: true, // All signed-in members can edit their own profile
      isCaptain: sessionRole === "ADMIN" || roles.includes("Captain"),
      isTreasurer: roles.includes("Treasurer"),
      isSecretary: roles.includes("Secretary"),
      isHandicapper: roles.includes("Handicapper"),
    };
  } catch (error) {
    console.error("[RBAC] Error getting permissions:", error);
    return getDefaultPermissions();
  }
}

/**
 * Get permissions for a specific member (for checking if user can edit another member)
 */
export async function getPermissionsForMember(memberId: string): Promise<Permissions> {
  try {
    const uid = await ensureSignedIn();
    const user = await getUserDoc(uid);
    if (!user?.activeMemberId) {
      return getDefaultPermissions();
    }

    const currentMember = await getMemberDoc(user.activeMemberId);
    if (!currentMember) {
      return getDefaultPermissions();
    }

    const targetMember = await getMemberDoc(memberId);
    if (!targetMember) {
      return getDefaultPermissions();
    }

    const sessionRole = sessionRoleFromRoles(normalizeMemberRoles(currentMember.roles));
    const roles = normalizeMemberRoles(targetMember.roles);

    return {
      canManageRoles: sessionRole === "ADMIN" || roles.includes("Captain"),
      canManageMembers: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Treasurer"),
      canManageEvents: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Secretary"),
      canManageTeeSheet: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Handicapper"),
      canManageHandicaps: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Handicapper"),
      canManageFinance: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Treasurer"),
      canEnterResults: sessionRole === "ADMIN" || roles.includes("Captain") || roles.includes("Secretary") || roles.includes("Handicapper"),
      canEditOwnProfile: session.currentUserId === memberId, // Can only edit own profile
      isCaptain: sessionRole === "ADMIN" || roles.includes("Captain"),
      isTreasurer: roles.includes("Treasurer"),
      isSecretary: roles.includes("Secretary"),
      isHandicapper: roles.includes("Handicapper"),
    };
  } catch (error) {
    console.error("[RBAC] Error getting permissions for member:", error);
    return getDefaultPermissions();
  }
}

/**
 * Check if current user can edit a specific member
 */
export async function canEditMember(targetMemberId: string): Promise<boolean> {
  const uid = await ensureSignedIn();
  const user = await getUserDoc(uid);
  if (!user?.activeMemberId) return false;

  // Can edit own profile
  if (user.activeMemberId === targetMemberId) return true;
  
  // Can edit others if has canManageMembers permission
  const permissions = await getPermissions();
  return permissions.canManageMembers;
}

function getDefaultPermissions(): Permissions {
  return {
    canManageRoles: false,
    canManageMembers: false,
    canManageEvents: false,
    canManageTeeSheet: false,
    canManageHandicaps: false,
    canManageFinance: false,
    canEnterResults: false,
    canEditOwnProfile: false,
    isCaptain: false,
    isTreasurer: false,
    isSecretary: false,
    isHandicapper: false,
  };
}














