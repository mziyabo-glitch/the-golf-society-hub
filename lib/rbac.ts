/**
 * Centralized RBAC (Role-Based Access Control)
 * Single source of truth for all permissions
 * 
 * IMPORTANT: Captain ALWAYS returns true for ALL permissions.
 * This is by design - the Captain is the society admin.
 * 
 * FIRESTORE-ONLY: Member data comes from Firestore
 * 
 * Inputs: session (current user), members list, optional society config
 * Output: Permissions object with boolean flags
 */

import { getSession } from "./session";
import { getCurrentUserRoles, getMemberById } from "./roles";
import { 
  normalizeSessionRole, 
  normalizeMemberRoles,
  type MemberRole,
} from "./permissions";

export type Permissions = {
  // Core permissions (use these for access control)
  canManageRoles: boolean;        // Captain only
  canManageMembers: boolean;       // Captain or Treasurer
  canManageEvents: boolean;        // Captain or Secretary
  canManageTeeSheet: boolean;      // Captain or Handicapper
  canManageHandicaps: boolean;     // Captain or Handicapper
  canManageFinance: boolean;       // Captain or Treasurer
  canEnterResults: boolean;         // Captain, Secretary, or Handicapper
  canEditOwnProfile: boolean;       // All signed-in members
  
  // Destructive action permissions (use these for delete operations)
  canDeleteEvent: boolean;         // Captain only
  canDeleteMember: boolean;        // Captain or Treasurer
  canResetTeeSheet: boolean;       // Captain only
  canPublishResults: boolean;      // Captain, Secretary, or Handicapper
  
  // Role flags (for UI display, NOT for permission checks)
  isCaptain: boolean;               // Is Captain
  isTreasurer: boolean;             // Is Treasurer
  isSecretary: boolean;             // Is Secretary
  isHandicapper: boolean;           // Is Handicapper
};

/**
 * Get current user's permissions
 * Returns all false if not loaded yet (safe default)
 * 
 * IMPORTANT: Captain ALWAYS returns true for ALL permissions.
 * IMPORTANT: Session role "admin" also gets ALL permissions (for initial setup).
 * 
 * DEFENSIVE: Always returns a valid Permissions object, never throws.
 */
export async function getPermissions(): Promise<Permissions> {
  try {
    const session = await getSession();
    
    // If no session at all, use session role to determine permissions
    // This handles the case where a society was just created (no members yet)
    const sessionRole = normalizeSessionRole(session?.role);
    
    // IMPORTANT: If session role is ADMIN, grant all permissions
    // This is for initial setup when no members exist yet
    if (sessionRole === "ADMIN") {
      if (__DEV__) {
        console.log("[RBAC] Session role is ADMIN - granting all permissions", {
          sessionRole,
          currentUserId: session?.currentUserId,
        });
      }
      return {
        canManageRoles: true,
        canManageMembers: true,
        canManageEvents: true,
        canManageTeeSheet: true,
        canManageHandicaps: true,
        canManageFinance: true,
        canEnterResults: true,
        canEditOwnProfile: true,
        canDeleteEvent: true,
        canDeleteMember: true,
        canResetTeeSheet: true,
        canPublishResults: true,
        isCaptain: true,
        isTreasurer: false,
        isSecretary: false,
        isHandicapper: false,
      };
    }
    
    // If no current user ID, return default (but session role check above handles admin)
    if (!session || !session.currentUserId) {
      return getDefaultPermissions();
    }

    const rawRoles = await getCurrentUserRoles();
    // Ensure rawRoles is an array before normalization
    const roles = normalizeMemberRoles(Array.isArray(rawRoles) ? rawRoles : []);

    const permissions = computePermissions(sessionRole, roles);
    
    // DEV ONLY: Log permission resolution once per call
    if (__DEV__) {
      console.log("[RBAC]", {
        sessionRole,
        roles: Array.from(roles),
        permissions,
      });
    }
    
    return permissions;
  } catch (error) {
    console.error("[RBAC] Error getting permissions:", error);
    return getDefaultPermissions();
  }
}

/**
 * Compute permissions from session role and member roles
 * IMPORTANT: Captain (or ADMIN session) ALWAYS returns true for ALL permissions
 */
function computePermissions(sessionRole: string, roles: MemberRole[]): Permissions {
  // Captain or ADMIN session role gets ALL permissions
  const isCaptain = sessionRole === "ADMIN" || roles.includes("Captain");
  
  // Role flags
  const isTreasurer = roles.includes("Treasurer");
  const isSecretary = roles.includes("Secretary");
  const isHandicapper = roles.includes("Handicapper");
  
  // If Captain, ALL permissions are true
  if (isCaptain) {
    return {
      canManageRoles: true,
      canManageMembers: true,
      canManageEvents: true,
      canManageTeeSheet: true,
      canManageHandicaps: true,
      canManageFinance: true,
      canEnterResults: true,
      canEditOwnProfile: true,
      canDeleteEvent: true,
      canDeleteMember: true,
      canResetTeeSheet: true,
      canPublishResults: true,
      isCaptain: true,
      isTreasurer,
      isSecretary,
      isHandicapper,
    };
  }
  
  // Non-Captain permissions
  return {
    canManageRoles: false,  // Captain only
    canManageMembers: isTreasurer,  // Treasurer can manage members
    canManageEvents: isSecretary,  // Secretary can manage events
    canManageTeeSheet: isHandicapper,  // Handicapper can manage tee sheet
    canManageHandicaps: isHandicapper,  // Handicapper can manage handicaps
    canManageFinance: isTreasurer,  // Treasurer can manage finance
    canEnterResults: isSecretary || isHandicapper,  // Secretary or Handicapper
    canEditOwnProfile: true,  // All signed-in members
    canDeleteEvent: false,  // Captain only
    canDeleteMember: isTreasurer,  // Treasurer can delete members
    canResetTeeSheet: false,  // Captain only
    canPublishResults: isSecretary || isHandicapper,  // Secretary or Handicapper
    isCaptain: false,
    isTreasurer,
    isSecretary,
    isHandicapper,
  };
}

/**
 * Get permissions for a specific member (for checking if user can edit another member)
 * Loads member from Firestore
 */
export async function getPermissionsForMember(memberId: string): Promise<Permissions> {
  try {
    const session = await getSession();
    if (!session.currentUserId) {
      return getDefaultPermissions();
    }

    // Load member data from Firestore
    const member = await getMemberById(memberId);
    
    if (!member) {
      return getDefaultPermissions();
    }

    const sessionRole = normalizeSessionRole(session.role);
    const roles = normalizeMemberRoles(member.roles);
    
    const permissions = computePermissions(sessionRole, roles);
    
    // Override canEditOwnProfile based on whether this is the current user
    return {
      ...permissions,
      canEditOwnProfile: session.currentUserId === memberId,
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
    canDeleteEvent: false,
    canDeleteMember: false,
    canResetTeeSheet: false,
    canPublishResults: false,
    isCaptain: false,
    isTreasurer: false,
    isSecretary: false,
    isHandicapper: false,
  };
}
