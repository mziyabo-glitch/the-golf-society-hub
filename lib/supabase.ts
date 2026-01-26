import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// 🔎 TEMP DEBUG LOGS — REMOVE AFTER FIXING
console.log("SUPABASE DEBUG");
console.log("URL:", supabaseUrl);
console.log("ANON KEY LENGTH:", supabaseAnonKey?.length);

// HARD FAIL if env is missing (makes errors obvious)
if (!supabaseUrl) {
  throw new Error("EXPO_PUBLIC_SUPABASE_URL is missing");
}
if (!supabaseAnonKey) {
  throw new Error("EXPO_PUBLIC_SUPABASE_ANON_KEY is missing");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // as agreed: no local storage
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
