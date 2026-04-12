// lib/supabase.ts
// SINGLETON Supabase client - use this everywhere
// DO NOT create additional clients elsewhere

import "react-native-url-polyfill/auto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabaseStorage } from "@/lib/supabaseStorage";
import { AppState, Platform } from "react-native";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("[supabase] url:", !!supabaseUrl, "anon:", !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase env vars missing. Set EXPO_PUBLIC_SUPABASE_* or NEXT_PUBLIC_SUPABASE_*"
  );
}

// Singleton instance
let supabaseInstance: SupabaseClient | null = null;
export const SUPABASE_AUTH_CONFIG = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: Platform.OS === "web",
  storageKey: "supabase-auth",
} as const;

let appStateSubscription: { remove: () => void } | null = null;

function setupNativeTokenAutoRefresh(client: SupabaseClient): void {
  if (Platform.OS === "web" || appStateSubscription) return;

  // RN does not expose browser visibility events. Tie token refresh lifecycle
  // to app foreground/background to keep sessions healthy across restarts.
  client.auth.startAutoRefresh();
  appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active") client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
}

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  // On web, detect OAuth/magic-link session from URL hash after redirect
  supabaseInstance = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      // AsyncStorage on native, localStorage on web (via supabaseStorage)
      storage: supabaseStorage,
      persistSession: SUPABASE_AUTH_CONFIG.persistSession,
      autoRefreshToken: SUPABASE_AUTH_CONFIG.autoRefreshToken,
      detectSessionInUrl: SUPABASE_AUTH_CONFIG.detectSessionInUrl,
      storageKey: SUPABASE_AUTH_CONFIG.storageKey,
    },
  });

  setupNativeTokenAutoRefresh(supabaseInstance);

  return supabaseInstance;
}

// Export the singleton client
export const supabase = getSupabaseClient();

// Type export for consumers that need it
export type { SupabaseClient };
