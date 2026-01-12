/**
 * Single source of truth for user session state
 * Handles currentUserId and role management
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_USER_ID_KEY = "session.currentUserId";
const SESSION_ROLE_KEY = "session.role";
const SESSION_EMAIL_KEY = "session.userEmail";

// Legacy keys to migrate from (one-time migration)
const LEGACY_USER_KEY = "GSOCIETY_CURRENT_USER";
const LEGACY_ADMIN_PIN_KEY = "GSOCIETY_ADMIN_PIN";

export type UserRole = "admin" | "member";

export type Session = {
  currentUserId: string | null;
  role: UserRole;
  email?: string | null;
};

let migrationDone = false;

/**
 * Migrate legacy keys to new session format (one-time)
 */
async function migrateLegacySession(): Promise<void> {
  if (migrationDone) return;

  try {
    // Check if new session keys already exist
    const hasNewSession = await AsyncStorage.getItem(SESSION_USER_ID_KEY);
    if (hasNewSession) {
      migrationDone = true;
      return;
    }

    // Try to migrate from legacy CURRENT_USER_KEY
    const legacyUserData = await AsyncStorage.getItem(LEGACY_USER_KEY);
    if (legacyUserData) {
      try {
        const legacyUser = JSON.parse(legacyUserData);
        if (legacyUser.userId) {
          await AsyncStorage.setItem(SESSION_USER_ID_KEY, legacyUser.userId);
        }
        if (legacyUser.role === "admin" || legacyUser.role === "member") {
          await AsyncStorage.setItem(SESSION_ROLE_KEY, legacyUser.role);
        } else {
          // Default to member if role is invalid
          await AsyncStorage.setItem(SESSION_ROLE_KEY, "member");
        }
      } catch (error) {
        console.error("Error migrating legacy user data:", error);
      }
    } else {
      // No legacy data, set defaults
      await AsyncStorage.setItem(SESSION_ROLE_KEY, "member");
    }

    migrationDone = true;
  } catch (error) {
    console.error("Error during session migration:", error);
    migrationDone = true; // Prevent retry loops
  }
}

/**
 * Get current session (currentUserId, role, and email)
 * Always reads from AsyncStorage (single source of truth)
 */
export async function getSession(): Promise<Session> {
  // Run migration once
  await migrateLegacySession();

  try {
    const currentUserId = await AsyncStorage.getItem(SESSION_USER_ID_KEY);
    const role = await AsyncStorage.getItem(SESSION_ROLE_KEY);
    const email = await AsyncStorage.getItem(SESSION_EMAIL_KEY);

    const session: Session = {
      currentUserId: currentUserId || null,
      role: (role === "admin" || role === "member" ? role : "member") as UserRole,
      email: email || null,
    };
    
    // DEV: Log session for debugging
    if (__DEV__) {
      console.log("[Session] getSession:", { 
        currentUserId: session.currentUserId, 
        role: session.role,
        rawRole: role,
      });
    }
    
    return session;
  } catch (error) {
    console.error("Error loading session:", error);
    return {
      currentUserId: null,
      role: "member",
      email: null,
    };
  }
}

/**
 * Set current user ID
 */
export async function setCurrentUserId(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_USER_ID_KEY, userId);
  } catch (error) {
    console.error("Error saving current user ID:", error);
    throw error;
  }
}

/**
 * Set user role
 */
export async function setRole(role: UserRole): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_ROLE_KEY, role);
  } catch (error) {
    console.error("Error saving role:", error);
    throw error;
  }
}

/**
 * Set user email (for auth-to-member matching)
 */
export async function setEmail(email: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_EMAIL_KEY, email.toLowerCase().trim());
  } catch (error) {
    console.error("Error saving email:", error);
    throw error;
  }
}

/**
 * Clear session (logout)
 */
export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([SESSION_USER_ID_KEY, SESSION_ROLE_KEY, SESSION_EMAIL_KEY]);
  } catch (error) {
    console.error("Error clearing session:", error);
    throw error;
  }
}



