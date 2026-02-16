// lib/supabaseStorage.ts
// Cross-platform storage adapter for Supabase auth
// - Web: uses localStorage with "gsh:" prefix
// - Native (iOS/Android): uses expo-secure-store with AFTER_FIRST_UNLOCK

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const STORAGE_PREFIX = "gsh:";

/**
 * Compatibility shim.
 * Session persistence is now always enabled to prevent reload/restart sign-out.
 */
export function setRememberMe(value: boolean): void {
  if (!value) {
    console.warn("[supabaseStorage] rememberMe=false ignored; persistence is enforced.");
  }
}

/** Session persistence is always on. */
export function getRememberMe(): boolean {
  return true;
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

/** Explicitly clear the persisted Supabase auth payload. */
export async function clearAuthStorage(): Promise<void> {
  await supabaseStorage.removeItem("supabase-auth");
}
