/**
 * Centralized storage management for golf-society-pro
 * Provides safe reset functionality and storage key management
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearSession } from "./session";

// All storage keys used in the app
export const STORAGE_KEYS = {
  // Society data
  SOCIETY_ACTIVE: "GSOCIETY_ACTIVE",
  SOCIETY_DRAFT: "GSOCIETY_DRAFT",
  
  // Data
  MEMBERS: "GSOCIETY_MEMBERS",
  EVENTS: "GSOCIETY_EVENTS",
  SCORES: "GSOCIETY_SCORES",
  COURSES: "GSOCIETY_COURSES",
  
  // Admin & Security
  ADMIN_PIN: "GSOCIETY_ADMIN_PIN",
  
  // Session (managed by lib/session.ts)
  SESSION_USER_ID: "session.currentUserId",
  SESSION_ROLE: "session.role",
  
  // Legacy keys (for migration cleanup)
  LEGACY_CURRENT_USER: "GSOCIETY_CURRENT_USER",
  LEGACY_ADMIN_PIN: "GSOCIETY_ADMIN_PIN",
  
  // Theme preference
  THEME_MODE: "GSOCIETY_THEME_MODE",
} as const;

/**
 * Get all storage keys that should be cleared on reset
 */
export function getAllStorageKeys(): string[] {
  return [
    STORAGE_KEYS.SOCIETY_ACTIVE,
    STORAGE_KEYS.SOCIETY_DRAFT,
    STORAGE_KEYS.MEMBERS,
    STORAGE_KEYS.EVENTS,
    STORAGE_KEYS.SCORES,
    STORAGE_KEYS.COURSES,
    STORAGE_KEYS.ADMIN_PIN,
    STORAGE_KEYS.SESSION_USER_ID,
    STORAGE_KEYS.SESSION_ROLE,
    STORAGE_KEYS.THEME_MODE,
    // Legacy keys
    STORAGE_KEYS.LEGACY_CURRENT_USER,
    STORAGE_KEYS.LEGACY_ADMIN_PIN,
  ];
}

/**
 * Reset all app data to a clean state
 * This clears all storage and session data, returning the app to first-run state
 */
export async function resetAllData(): Promise<void> {
  try {
    const allKeys = getAllStorageKeys();
    await AsyncStorage.multiRemove(allKeys);
    
    // Also clear session using the session utility
    await clearSession();
    
    console.log("All app data reset successfully");
  } catch (error) {
    console.error("Error resetting app data:", error);
    throw error;
  }
}

/**
 * Debug helper: Dump all storage keys and values (dev only)
 * Use this for troubleshooting storage issues
 */
export async function dumpStorageKeys(): Promise<void> {
  if (__DEV__) {
    try {
      const allKeys = getAllStorageKeys();
      const values: Record<string, any> = {};
      
      for (const key of allKeys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          try {
            values[key] = JSON.parse(value);
          } catch {
            values[key] = value; // Plain string
          }
        }
      }
      
      console.log("=== STORAGE DUMP ===");
      console.log(JSON.stringify(values, null, 2));
      console.log("===================");
    } catch (error) {
      console.error("Error dumping storage:", error);
    }
  }
}

/**
 * Check if app has been initialized (has society data)
 */
export async function hasActiveSociety(): Promise<boolean> {
  try {
    const societyData = await AsyncStorage.getItem(STORAGE_KEYS.SOCIETY_ACTIVE);
    return societyData !== null;
  } catch {
    return false;
  }
}

/**
 * Storage keys documentation:
 * - GSOCIETY_ACTIVE: Active society data (name, course, etc.)
 * - GSOCIETY_DRAFT: Draft society data (during creation)
 * - GSOCIETY_MEMBERS: Array of member objects [{id, name, handicap, roles}]
 * - GSOCIETY_EVENTS: Array of event objects
 * - GSOCIETY_SCORES: Scores data object
 * - GSOCIETY_ADMIN_PIN: Admin PIN string
 * - session.currentUserId: Current selected member ID (points to member in GSOCIETY_MEMBERS)
 * - session.role: Session role ("admin" | "member") for testing override
 */

/**
 * Member data type
 */
export type MemberData = {
  id: string;
  name: string;
  email?: string; // For auth-to-member mapping
  handicap?: number;
  sex?: "male" | "female";
  roles?: string[];
};

/**
 * Ensure valid current member exists
 * Self-healing function that:
 * - Removes ghost "Owner" member if other real members exist
 * - Sets currentUserId to first member if missing or invalid
 * - Tries to match currentUserId by email if not found by id
 * - Returns {members, currentUserId}
 * 
 * NOTE: We do NOT create fallback members anymore. If members array is empty,
 * the app should show onboarding flow to create a real member.
 */
export async function ensureValidCurrentMember(): Promise<{
  members: MemberData[];
  currentUserId: string | null;
}> {
  const { getSession, setCurrentUserId } = await import("./session");
  
  try {
    // Load members
    const membersData = await AsyncStorage.getItem(STORAGE_KEYS.MEMBERS);
    let members: MemberData[] = membersData ? JSON.parse(membersData) : [];
    
    // Load current user ID
    const session = await getSession();
    let currentUserId = session.currentUserId;
    
    // Run healing/migration to remove ghost "Owner" member
    const healed = await healGhostOwnerMember(members);
    if (healed.changed) {
      members = healed.members;
      await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
      console.log("[Storage] Removed ghost Owner member during healing");
    }
    
    // If members array is empty, just return empty - let onboarding handle it
    if (members.length === 0) {
      console.log("[Storage] No members found - app should show onboarding");
      return { members: [], currentUserId: null };
    }
    
    // Ensure all members have roles array (default to ["member"])
    // Also migrate: add sex field if missing (default to "male" for backward compatibility)
    let needsSave = false;
    members = members.map((m) => {
      let updated = { ...m };
      if (!updated.roles || updated.roles.length === 0) {
        needsSave = true;
        updated.roles = ["member"];
      }
      // Normalize roles to lowercase
      const normalizedRoles = updated.roles.map((r) => r.toLowerCase());
      if (JSON.stringify(normalizedRoles) !== JSON.stringify(updated.roles)) {
        needsSave = true;
        updated.roles = normalizedRoles;
      }
      // Migration: add sex if missing (will be required in UI, but default for existing records)
      if (!updated.sex) {
        needsSave = true;
        updated.sex = "male"; // Default for existing records
      }
      return updated;
    });
    if (needsSave) {
      await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
    }
    
    // If currentUserId is missing or points to non-existent member
    if (!currentUserId || !members.find((m) => m.id === currentUserId)) {
      // Try to match by email (case-insensitive) if session has email info
      const matchedMember = await tryMatchMemberByEmail(members);
      if (matchedMember) {
        await setCurrentUserId(matchedMember.id);
        currentUserId = matchedMember.id;
        console.log("[Storage] Matched currentUserId by email:", matchedMember.id);
      } else {
        // Fall back to first member
        const firstMember = members[0];
        if (firstMember) {
          await setCurrentUserId(firstMember.id);
          currentUserId = firstMember.id;
          console.log("[Storage] Set currentUserId to first member:", firstMember.id);
        }
      }
    }
    
    return { members, currentUserId };
  } catch (error) {
    console.error("Error ensuring valid current member:", error);
    return { members: [], currentUserId: null };
  }
}

/**
 * Heal/migrate ghost "Owner" member
 * If a member named "Owner" exists AND there are other real members, remove "Owner".
 * Also removes "Owner" references from tee sheet groups.
 */
async function healGhostOwnerMember(members: MemberData[]): Promise<{
  members: MemberData[];
  changed: boolean;
}> {
  // Find "Owner" member (case-insensitive)
  const ownerIdx = members.findIndex(
    (m) => m.name.toLowerCase() === "owner"
  );
  
  if (ownerIdx === -1) {
    return { members, changed: false };
  }
  
  // Only remove if there are other real members
  if (members.length <= 1) {
    console.log("[Storage] Owner is the only member, not removing");
    return { members, changed: false };
  }
  
  const ownerMember = members[ownerIdx];
  console.log("[Storage] Removing ghost Owner member:", ownerMember.id);
  
  // Remove Owner from members array
  const filteredMembers = members.filter((_, idx) => idx !== ownerIdx);
  
  // Also clean up Owner from any saved tee sheet groups
  await cleanupOwnerFromEvents(ownerMember.id);
  
  return { members: filteredMembers, changed: true };
}

/**
 * Remove "Owner" member ID from all event tee sheet groups
 */
async function cleanupOwnerFromEvents(ownerId: string): Promise<void> {
  try {
    const eventsData = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
    if (!eventsData) return;
    
    const events = JSON.parse(eventsData);
    let changed = false;
    
    for (const event of events) {
      // Clean up teeSheet groups
      if (event.teeSheet?.groups) {
        for (const group of event.teeSheet.groups) {
          if (group.players?.includes(ownerId)) {
            group.players = group.players.filter((id: string) => id !== ownerId);
            changed = true;
          }
        }
      }
      
      // Clean up playerIds
      if (event.playerIds?.includes(ownerId)) {
        event.playerIds = event.playerIds.filter((id: string) => id !== ownerId);
        changed = true;
      }
    }
    
    if (changed) {
      await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
      console.log("[Storage] Cleaned up Owner from event tee sheets");
    }
  } catch (error) {
    console.error("[Storage] Error cleaning up Owner from events:", error);
  }
}

/**
 * Try to match current user to a member by email
 * Used when currentUserId doesn't match any member.id
 */
async function tryMatchMemberByEmail(
  members: MemberData[]
): Promise<MemberData | null> {
  try {
    // Check if we have a stored user email to match against
    const userEmailData = await AsyncStorage.getItem("session.userEmail");
    if (!userEmailData) return null;
    
    const userEmail = userEmailData.toLowerCase().trim();
    if (!userEmail) return null;
    
    // Find member with matching email (case-insensitive)
    const matched = members.find(
      (m) => m.email && m.email.toLowerCase().trim() === userEmail
    );
    
    return matched || null;
  } catch (error) {
    console.error("[Storage] Error matching member by email:", error);
    return null;
  }
}

/**
 * Set user email for auth-to-member mapping
 */
export async function setUserEmail(email: string): Promise<void> {
  try {
    await AsyncStorage.setItem("session.userEmail", email);
    console.log("[Storage] Saved user email for member matching");
  } catch (error) {
    console.error("[Storage] Error saving user email:", error);
  }
}

/**
 * Get user email
 */
export async function getUserEmail(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem("session.userEmail");
  } catch (error) {
    console.error("[Storage] Error getting user email:", error);
    return null;
  }
}

/**
 * Bootstrap app state on startup
 * Ensures app has valid state even after reset or corruption
 * - Checks if society exists
 * - If society exists but no members, creates admin member
 * - Ensures currentUserId is valid
 * - Ensures all members have roles
 */
export async function ensureBootstrapState(): Promise<void> {
  try {
    // Check if society exists
    const hasSociety = await hasActiveSociety();
    
    if (hasSociety) {
      // Society exists, ensure members and current user are valid
      await ensureValidCurrentMember();
    }
    // If no society, app will show onboarding - that's fine
  } catch (error) {
    console.error("Error in bootstrap state:", error);
    // Don't throw - allow app to continue
  }
}

