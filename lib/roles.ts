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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSession } from "./session";
import { STORAGE_KEYS } from "./storage";

export type MemberRole = "captain" | "treasurer" | "secretary" | "handicapper" | "member" | "admin";

const MEMBERS_KEY = STORAGE_KEYS.MEMBERS;
let migrationDone = false;

export type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  roles?: MemberRole[]; // Array of roles (member can have multiple)
};

/**
 * Migrate existing members to include roles field
 * Defaults to ["member"] if missing
 */
async function migrateMemberRoles(): Promise<void> {
  if (migrationDone) return;

  try {
    const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
    if (!membersData) {
      migrationDone = true;
      return;
    }

    const members: MemberData[] = JSON.parse(membersData);
    let needsUpdate = false;

    const migratedMembers = members.map((member) => {
      if (!member.roles || member.roles.length === 0) {
        needsUpdate = true;
        return {
          ...member,
          roles: ["member"] as MemberRole[],
        };
      }
      return member;
    });

    if (needsUpdate) {
      await AsyncStorage.setItem(MEMBERS_KEY, JSON.stringify(migratedMembers));
    }

    migrationDone = true;
  } catch (error) {
    console.error("Error migrating member roles:", error);
    migrationDone = true; // Prevent retry loops
  }
}

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
    await migrateMemberRoles(); // Ensure migration runs
    
    const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
    if (!membersData) return null;
    
    const members: MemberData[] = JSON.parse(membersData);
    const member = members.find((m) => m.id === memberId) || null;
    
    // Ensure member has roles
    if (member && (!member.roles || member.roles.length === 0)) {
      return { ...member, roles: ["member"] };
    }
    
    return member;
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
    await migrateMemberRoles();
    
    const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
    if (!membersData) return [];
    
    const members: MemberData[] = JSON.parse(membersData);
    // Ensure all members have roles
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
  const session = await getSession();
  if (!session.currentUserId) return null;
  return await getMemberById(session.currentUserId);
}

/**
 * Get current user's roles
 */
export async function getCurrentUserRoles(): Promise<MemberRole[]> {
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

