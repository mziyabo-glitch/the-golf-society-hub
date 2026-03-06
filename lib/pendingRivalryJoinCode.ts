/**
 * Persists a pending rivalry join code across login/signup flow.
 * Used when an unauthenticated user opens /join-rivalry?code=ABC123.
 * After auth, we redirect them back to the join flow with the code.
 *
 * Uses localStorage on web, AsyncStorage on native.
 * Key: gsh:pendingRivalryJoinCode (always persists, independent of "remember me").
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "gsh:pendingRivalryJoinCode";

export async function storePendingRivalryJoinCode(code: string): Promise<void> {
  const normalized = String(code).trim().toUpperCase();
  if (!normalized) return;

  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(KEY, normalized);
    }
    return;
  }
  await AsyncStorage.setItem(KEY, normalized);
}

export async function consumePendingRivalryJoinCode(): Promise<string | null> {
  let value: string | null = null;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.localStorage) {
      value = window.localStorage.getItem(KEY);
      if (value) window.localStorage.removeItem(KEY);
    }
  } else {
    value = await AsyncStorage.getItem(KEY);
    if (value) await AsyncStorage.removeItem(KEY);
  }
  return value ? value.trim().toUpperCase() : null;
}
