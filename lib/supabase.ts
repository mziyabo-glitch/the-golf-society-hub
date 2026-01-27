import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[supabase] Missing env vars. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

let bootstrapComplete = false;

export function setSupabaseBootstrapComplete(value: boolean) {
  bootstrapComplete = value;
}

export function getSupabaseBootstrapComplete() {
  return bootstrapComplete;
}

export async function requireSupabaseSession(tag?: string) {
  if (!bootstrapComplete) {
    throw new Error(`[supabase] Bootstrap not complete${tag ? ` (${tag})` : ""}`);
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message || "Failed to load Supabase session");
  }
  if (!data.session || !data.session.user) {
    throw new Error(`[supabase] No active session${tag ? ` (${tag})` : ""}`);
  }

  return data.session;
}
