// lib/supabase.ts
// SINGLETON Supabase client - use this everywhere
// DO NOT create additional clients elsewhere

import "react-native-url-polyfill/auto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabaseStorage } from "@/lib/supabaseStorage";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL;

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log("[supabase] url:", !!supabaseUrl, "anon:", !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase env vars missing. Check NEXT_PUBLIC_SUPABASE_* or EXPO_PUBLIC_SUPABASE_*"
  );
}

// Singleton instance
let supabaseInstance: SupabaseClient | null = null;
let authLoggingAttached = false;

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  supabaseInstance = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      // Use cross-platform storage adapter (localStorage on web, SecureStore on native)
      storage: supabaseStorage,
      // Persist session across app restarts
      persistSession: true,
      // Automatically refresh token before expiry
      autoRefreshToken: true,
      // No OAuth callback flow is used; sessions are established explicitly.
      detectSessionInUrl: false,
      // Storage key for session (will be prefixed by supabaseStorage with "gsh:")
      storageKey: "supabase-auth",
    },
  });

  return supabaseInstance;
}

function attachAuthStateLogging(client: SupabaseClient): void {
  if (authLoggingAttached) return;
  try {
    client.auth.onAuthStateChange((event) => {
      console.log("[supabase] onAuthStateChange:", event);
    });
    authLoggingAttached = true;
  } catch (error) {
    console.error("[supabase] failed to attach auth logging:", error);
  }
}

// Export the singleton client
export const supabase = getSupabaseClient();
attachAuthStateLogging(supabase);

// Type export for consumers that need it
export type { SupabaseClient };
