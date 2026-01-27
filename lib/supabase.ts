// lib/supabase.ts
// SINGLETON Supabase client - use this everywhere
// DO NOT create additional clients elsewhere

import "react-native-url-polyfill/auto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabaseStorage } from "@/lib/supabaseStorage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. " +
    "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file."
  );
}

// Singleton instance
let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Use cross-platform storage adapter (localStorage on web, SecureStore on native)
      storage: supabaseStorage,
      // Persist session across app restarts
      persistSession: true,
      // Automatically refresh token before expiry
      autoRefreshToken: true,
      // Detect OAuth callback in URL (for social logins)
      detectSessionInUrl: true,
      // Storage key for session (will be prefixed by supabaseStorage with "gsh:")
      storageKey: "supabase-auth",
    },
  });

  return supabaseInstance;
}

// Export the singleton client
export const supabase = getSupabaseClient();

// Type export for consumers that need it
export type { SupabaseClient };
