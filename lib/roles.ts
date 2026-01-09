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
 * 
 * FIRESTORE-ONLY: All member data now comes from Firestore
 */

import { Platform } from "react-native";
import { getSession } from "./session";
import { listMembers, getMember, upsertMember } from "./firestore/members";

export type MemberRole = "captain" | "treasurer" | "secretary" | "handicapper" | "member" | "admin";

export type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  sex?: "male" | "female";
  email?: string;
  roles?: string[]; // Array of roles (member can have multiple) - using string[] for compatibility
  paid?: boolean;
  amountPaid?: number;
  paidDate?: string;
};

/**
 * SYNC helper: Check if a member object has a specific role.
 * Use this when you already have a MemberData object.
 * Role matching is case-insensitive.
 * 
 * Example: hasRole(member, "captain")
 */
export function hasRole(member: MemberData | null, role: MemberRole): boolean {
  if (!member) return false;
  if (!member.roles || member.roles.length === 0) return role === "member";
  // Normalize both sides to lowercase for comparison
  const normalizedRole = role.toLowerCase();
  return member.roles.some((r) => r.toLowerCase() === normalizedRole);
}

/**
 * Check if member is admin-like (captain OR legacy admin flag)
 * Role matching is case-insensitive.
 */
export function isAdminLike(member: MemberData | null): boolean {
  if (!member) return false;
  if (!member.roles || member.roles.length === 0) return false;
  const lowerRoles = member.roles.map((r) => r.toLowerCase());
  return lowerRoles.includes("captain") || lowerRoles.includes("admin");
}

/**
 * Get member data by ID from Firestore
 */
export async function getMemberById(memberId: string): Promise<MemberData | null> {
  try {
    const member = await getMember(memberId);
    
    if (!member) return null;
    
    // Ensure member has roles
    if (!member.roles || member.roles.length === 0) {
      return { ...member, roles: ["member"] };
    }
    
    return member;
  } catch (error) {
    console.error("[Roles] Error loading member:", error);
    return null;
  }
}

/**
 * Get all members from Firestore
 */
export async function getAllMembers(): Promise<MemberData[]> {
  try {
    const members = await listMembers();
    
    // Ensure all members have roles
    return members.map((m) => ({
      ...m,
      roles: m.roles && m.roles.length > 0 ? m.roles : ["member"],
    }));
  } catch (error) {
    console.error("[Roles] Error loading members:", error);
    return [];
  }
}

/**
 * Get current user's member data
 */
export async function getCurrentMember(): Promise<MemberData | null> {
  const session = await getSession();
  if (!session.currentUserId) return null;
  return getMemberById(session.currentUserId);
}

/**
 * Get current user's roles as an array
 */
export async function getCurrentUserRoles(): Promise<string[]> {
  const member = await getCurrentMember();
  if (!member) return ["member"];
  return member.roles && member.roles.length > 0 ? member.roles : ["member"];
}

/**
 * Update a member's roles in Firestore
 * Ensures roles is always a string array
 */
export async function updateMemberRoles(
  memberId: string,
  roles: MemberRole[]
): Promise<boolean> {
  try {
    const member = await getMemberById(memberId);
    if (!member) {
      console.error("[Roles] Member not found:", memberId);
      return false;
    }

    // Normalize roles to lowercase strings
    const normalizedRoles = roles.map((r) => r.toLowerCase());
    
    // Ensure "member" is always included
    if (!normalizedRoles.includes("member")) {
      normalizedRoles.push("member");
    }

    // Update member with new roles
    const updatedMember: MemberData = {
      ...member,
      roles: normalizedRoles,
    };

    const result = await upsertMember(updatedMember);
    
    if (!result.success) {
      console.error("[Roles] Failed to update roles:", result.error);
      return false;
    }

    console.log("[Roles] Updated roles for member:", memberId, normalizedRoles);
    return true;
  } catch (error) {
    console.error("[Roles] Error updating member roles:", error);
    return false;
  }
}

/**
 * Check if member has any ManCo role (Captain, Secretary, Treasurer, Handicapper, Admin)
 * Role matching is case-insensitive.
 * SYNC version - use when you already have a member object
 */
export function hasMemberManCoRole(member: MemberData | null): boolean {
  if (!member) return false;
  if (!member.roles || member.roles.length === 0) return false;
  
  const manCoRoles = ["captain", "secretary", "treasurer", "handicapper", "admin"];
  const lowerRoles = member.roles.map((r) => r.toLowerCase());
  
  return lowerRoles.some((r) => manCoRoles.includes(r));
}

/**
 * Check if current user has any ManCo role
 * ASYNC version - loads current member from Firestore
 */
export async function hasManCoRole(): Promise<boolean> {
  const member = await getCurrentMember();
  return hasMemberManCoRole(member);
}

/**
 * Check if member can view finance (Treasurer, Captain, or Admin)
 * SYNC version - use when you already have a member object
 */
export function canMemberViewFinance(member: MemberData | null): boolean {
  if (!member) return false;
  if (!member.roles || member.roles.length === 0) return false;
  
  const financeRoles = ["treasurer", "captain", "admin"];
  const lowerRoles = member.roles.map((r) => r.toLowerCase());
  
  return lowerRoles.some((r) => financeRoles.includes(r));
}

/**
 * Check if current user can view finance
 * ASYNC version - loads current member from Firestore
 */
export async function canViewFinance(): Promise<boolean> {
  const member = await getCurrentMember();
  return canMemberViewFinance(member);
}
