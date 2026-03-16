/**
 * Server-side Supabase client with service role.
 * Use only in API routes / server context. Never expose to client.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let serverClient: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient | null {
  if (!supabaseUrl || !serviceRoleKey) return null;
  if (serverClient) return serverClient;
  serverClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serverClient;
}
