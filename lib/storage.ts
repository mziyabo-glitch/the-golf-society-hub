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
  handicap?: number;
  sex?: "male" | "female";
  roles?: string[];
};

/**
 * Ensure valid current member exists
 * Self-healing function that:
 * - Creates fallback member if members array is empty
 * - Sets currentUserId to first member if missing or invalid
 * - Returns {members, currentUserId}
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
    
    // If members array is empty, create fallback owner member
    // NOTE: This is a recovery mechanism only - in normal flow, the society creator
    // provides their name during onboarding. "Owner" is a placeholder that should
    // be changed by the user via Profile screen.
    if (members.length === 0) {
      const fallbackMember: MemberData = {
        id: Date.now().toString(),
        name: "Owner", // Placeholder - user should update via Profile
        roles: ["captain", "handicapper", "member"], // Use lowercase role names
        sex: "male", // Default sex for fallback member
      };
      
      members = [fallbackMember];
      await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
      
      // Set as current user
      await setCurrentUserId(fallbackMember.id);
      currentUserId = fallbackMember.id;
      
      // Set session to admin for initial setup
      const { setRole } = await import("./session");
      await setRole("admin");
      
      console.log("Created fallback owner member:", fallbackMember);
    } else {
      // Ensure all members have roles array (default to ["Member"])
      // Also migrate: add sex field if missing (default to "male" for backward compatibility)
      let needsSave = false;
      members = members.map((m) => {
        let updated = { ...m };
        if (!updated.roles || updated.roles.length === 0) {
          needsSave = true;
          updated.roles = ["Member"];
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
      
      // If currentUserId is missing or points to non-existent member, set to first member
      if (!currentUserId || !members.find((m) => m.id === currentUserId)) {
        const firstMember = members[0];
        if (firstMember) {
          await setCurrentUserId(firstMember.id);
          currentUserId = firstMember.id;
          console.log("Set currentUserId to first member:", firstMember.id);
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

