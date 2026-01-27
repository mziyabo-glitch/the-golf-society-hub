// lib/supabaseStorage.ts
// Cross-platform storage adapter for Supabase auth
// - Web: uses localStorage with "gsh:" prefix
// - Native (iOS/Android): uses expo-secure-store with AFTER_FIRST_UNLOCK

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const STORAGE_PREFIX = "gsh:";

/**
 * Storage adapter for Supabase auth that works on both web and native.
 * Implements the required interface: getItem, setItem, removeItem (all async).
 */
export const supabaseStorage = {
  /**
   * Get an item from storage
   */
  async getItem(key: string): Promise<string | null> {
    const prefixedKey = STORAGE_PREFIX + key;

    if (Platform.OS === "web") {
      // Web: use localStorage
      if (typeof window !== "undefined" && window.localStorage) {
        const value = window.localStorage.getItem(prefixedKey);
        return value;
      }
      return null;
    }

    // Native: use expo-secure-store
    try {
      const value = await SecureStore.getItemAsync(prefixedKey, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
      return value;
    } catch (error) {
      console.warn("[supabaseStorage] getItem error:", error);
      return null;
    }
  },

  /**
   * Set an item in storage
   */
  async setItem(key: string, value: string): Promise<void> {
    const prefixedKey = STORAGE_PREFIX + key;

    if (Platform.OS === "web") {
      // Web: use localStorage
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(prefixedKey, value);
      }
      return;
    }

    // Native: use expo-secure-store
    try {
      await SecureStore.setItemAsync(prefixedKey, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } catch (error) {
      console.warn("[supabaseStorage] setItem error:", error);
    }
  },

  /**
   * Remove an item from storage
   */
  async removeItem(key: string): Promise<void> {
    const prefixedKey = STORAGE_PREFIX + key;

    if (Platform.OS === "web") {
      // Web: use localStorage
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(prefixedKey);
      }
      return;
    }

    // Native: use expo-secure-store
    try {
      await SecureStore.deleteItemAsync(prefixedKey, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } catch (error) {
      console.warn("[supabaseStorage] removeItem error:", error);
    }
  },
};
