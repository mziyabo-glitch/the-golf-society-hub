// lib/supabase.ts
// SINGLETON Supabase client - use this everywhere
// DO NOT create additional clients elsewhere

import "react-native-url-polyfill/auto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabaseStorage } from "@/lib/supabaseStorage";

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

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  supabaseInstance = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      // AsyncStorage on native, localStorage on web (via supabaseStorage)
      storage: supabaseStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "supabase-auth",
    },
  });

  return supabaseInstance;
}

// Export the singleton client
export const supabase = getSupabaseClient();

// Type export for consumers that need it
export type { SupabaseClient };
