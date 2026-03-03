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

/** Last 6 chars of Supabase project ref for debug (detect wrong backend). */
export function getSupabaseProjectRefSuffix(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const ref = match?.[1] || "";
  return ref.slice(-6) || "—";
}
