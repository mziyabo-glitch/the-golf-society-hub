/**
 * Centralized RBAC (Role-Based Access Control)
 * Single source of truth for all permissions
 * 
 * Inputs: session (current user), members list, optional society config
 * Output: Permissions object with boolean flags
 */

import { getSession } from "./session";
import { getCurrentUserRoles } from "./roles";
import { 
  normalizeSessionRole, 
  normalizeMemberRoles,
  type SessionRole,
  type MemberRole 
} from "./permissions";
import { STORAGE_KEYS } from "./storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

/**
 * Get current user's permissions
 * Returns all false if not loaded yet (safe default)
 */
export async function getPermissions(): Promise<Permissions> {
  try {
    const session = await getSession();
    if (!session.currentUserId) {
      return getDefaultPermissions();
    }

    const sessionRole = normalizeSessionRole(session.role);
    const rawRoles = await getCurrentUserRoles();
    const roles = normalizeMemberRoles(rawRoles);

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
    const session = await getSession();
    if (!session.currentUserId) {
      return getDefaultPermissions();
    }

    // Load member data
    const membersData = await AsyncStorage.getItem(STORAGE_KEYS.MEMBERS);
    if (!membersData) {
      return getDefaultPermissions();
    }

    const members: Array<{ id: string; roles?: unknown }> = JSON.parse(membersData);
    const member = members.find((m) => m.id === memberId);
    
    if (!member) {
      return getDefaultPermissions();
    }

    const sessionRole = normalizeSessionRole(session.role);
    const roles = normalizeMemberRoles(member.roles);

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
  const session = await getSession();
  if (!session.currentUserId) return false;
  
  // Can edit own profile
  if (session.currentUserId === targetMemberId) return true;
  
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














