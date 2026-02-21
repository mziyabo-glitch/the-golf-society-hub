// lib/supabaseStorage.ts
// Cross-platform storage adapter for Supabase auth
// - Web: uses localStorage with "gsh:" prefix
// - Native (iOS/Android): uses expo-secure-store with AFTER_FIRST_UNLOCK
//
// "Remember me" toggle:
//   When rememberMe is false the adapter silently no-ops writes.
//   The session lives only in Supabase's in-memory state and is lost on
//   page reload / app restart.

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const STORAGE_PREFIX = "gsh:";

// In-memory flag — defaults to true (persist).
// The AuthScreen flips this BEFORE calling signIn so the adapter
// knows whether to actually write the token to disk.
let _rememberMe = true;

/** Call before signIn to control session persistence. */
export function setRememberMe(value: boolean): void {
  _rememberMe = value;

  // If the user unchecks "remember me", clear any previously stored
  // session so a stale token doesn't auto-sign them in next time.
  if (!value) {
    supabaseStorage.removeItem("supabase-auth").catch(() => {});
  }
}

/** Read the current remember-me preference. */
export function getRememberMe(): boolean {
  return _rememberMe;
}

/**
 * Storage adapter for Supabase auth that works on both web and native.
 * Implements the required interface: getItem, setItem, removeItem (all async).
 */
export const supabaseStorage = {
  async getItem(key: string): Promise<string | null> {
    const prefixedKey = STORAGE_PREFIX + key;

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(prefixedKey);
      }
      return null;
    }

    try {
      return await SecureStore.getItemAsync(prefixedKey, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } catch (error) {
      console.warn("[supabaseStorage] getItem error:", error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    // When "remember me" is off, skip persisting the session token.
    if (!_rememberMe) return;

    const prefixedKey = STORAGE_PREFIX + key;

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(prefixedKey, value);
      }
      return;
    }

    try {
      await SecureStore.setItemAsync(prefixedKey, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } catch (error) {
      console.warn("[supabaseStorage] setItem error:", error);
    }
  },

  async removeItem(key: string): Promise<void> {
    const prefixedKey = STORAGE_PREFIX + key;

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(prefixedKey);
      }
      return;
    }

    try {
      await SecureStore.deleteItemAsync(prefixedKey, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } catch (error) {
      console.warn("[supabaseStorage] removeItem error:", error);
    }
  },
};
