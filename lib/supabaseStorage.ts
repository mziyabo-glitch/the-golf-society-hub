// lib/supabaseStorage.ts
// Cross-platform storage adapter for Supabase auth
// - Web: uses localStorage with "gsh:" prefix
// - Native (iOS/Android): uses AsyncStorage for reliable session persistence
//
// "Remember me" toggle:
//   When rememberMe is false the adapter silently no-ops writes.
//   The session lives only in Supabase's in-memory state and is lost on
//   page reload / app restart.

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "gsh:";

// In-memory flag — defaults to true (persist).
// The AuthScreen flips this BEFORE calling signIn so the adapter
// knows whether to actually write the token to disk.
let _rememberMe = true;
export const hasSupabaseStorageAdapter = true;

function inspectTokenPayload(value: string | null): { hasAccessToken: boolean; hasRefreshToken: boolean } {
  if (!value) return { hasAccessToken: false, hasRefreshToken: false };
  try {
    const parsed = JSON.parse(value) as { access_token?: unknown; refresh_token?: unknown } | null;
    return {
      hasAccessToken: typeof parsed?.access_token === "string" && parsed.access_token.length > 0,
      hasRefreshToken: typeof parsed?.refresh_token === "string" && parsed.refresh_token.length > 0,
    };
  } catch {
    return { hasAccessToken: false, hasRefreshToken: false };
  }
}

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
 * Storage adapter for Supabase auth.
 * Uses AsyncStorage on native for reliable session persistence (Supabase recommends this).
 * Uses localStorage on web.
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
      const value = await AsyncStorage.getItem(prefixedKey);
      if (key === "supabase-auth") {
        const flags = inspectTokenPayload(value);
        console.log("[auth-persist-storage] read", {
          platform: Platform.OS,
          key,
          found: !!value,
          refreshTokenPresent: flags.hasRefreshToken,
        });
      }
      return value;
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
      await AsyncStorage.setItem(prefixedKey, value);
      if (key === "supabase-auth") {
        const flags = inspectTokenPayload(value);
        console.log("[auth-persist-storage] write", {
          platform: Platform.OS,
          key,
          accessTokenPresent: flags.hasAccessToken,
          refreshTokenPresent: flags.hasRefreshToken,
        });
      }
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
      await AsyncStorage.removeItem(prefixedKey);
    } catch (error) {
      console.warn("[supabaseStorage] removeItem error:", error);
    }
  },
};
