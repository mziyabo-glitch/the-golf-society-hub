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
      // Use PKCE flow (required for secure OAuth). The library defaults to
      // 'implicit' which does NOT store a code verifier, causing
      // exchangeCodeForSession to fail when the server returns a ?code= param.
      flowType: "pkce",
      // Let the Supabase client detect and exchange OAuth tokens/codes in
      // the URL on page load.  On web this handles the /auth/callback
      // redirect automatically; on native window.location doesn't contain
      // OAuth params so it's a no-op.  The manual callback handler in
      // oauthCallback.ts acts as a fallback if auto-detection already
      // established the session.
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
