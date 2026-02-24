/**
 * Supabase environment indicator (TEST vs PROD).
 * Used for UI display only. Backend is determined by EXPO_PUBLIC_SUPABASE_URL.
 */

export type SupabaseEnv = "test" | "prod";

export function getSupabaseEnv(): SupabaseEnv {
  const env = process.env.EXPO_PUBLIC_SUPABASE_ENV?.toLowerCase().trim();
  if (env === "prod" || env === "production") return "prod";
  return "test"; // default for development, preview, play
}
