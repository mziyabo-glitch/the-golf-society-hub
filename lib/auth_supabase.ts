import { supabase } from "@/lib/supabase";

/**
 * Get the currently authenticated user.
 * Returns null if not signed in.
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error("[auth_supabase] getCurrentUser error:", error.message);
    return null;
  }
  return user;
}

/**
 * Ensure we have a signed-in user (anonymous if needed).
 * Session is persisted via browser localStorage on web.
 *
 * IMPORTANT: This function ensures the Supabase client has a valid session
 * that will be sent with subsequent requests for RLS policies.
 */
export async function ensureSignedIn() {
  // First check if we have an existing session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error("[auth_supabase] getSession error:", sessionError.message);
  }

  if (session?.user) {
    console.log("[auth_supabase] Existing session found for user:", session.user.id);
    return session.user;
  }

  // No session, sign in anonymously
  console.log("[auth_supabase] No session found, signing in anonymously...");
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    console.error("[auth_supabase] signInAnonymously error:", error.message);
    throw error;
  }

  if (!data.user) {
    throw new Error("Supabase: no user returned from signInAnonymously()");
  }

  console.log("[auth_supabase] Signed in anonymously as:", data.user.id);
  return data.user;
}

/**
 * Verify the current auth state matches the expected user ID.
 * Throws if there's a mismatch or no auth.
 */
export async function verifyAuthState(expectedUserId: string): Promise<void> {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error("[auth_supabase] verifyAuthState error:", error.message);
    throw new Error("Failed to verify auth state: " + error.message);
  }

  if (!user) {
    throw new Error("No authenticated user found. Please sign in again.");
  }

  if (user.id !== expectedUserId) {
    console.error("[auth_supabase] User ID mismatch:", { expected: expectedUserId, actual: user.id });
    throw new Error("Auth state mismatch. Please refresh and try again.");
  }

  console.log("[auth_supabase] Auth state verified for user:", user.id);
}

/**
 * Ensure a profile row exists for this user.
 */
export async function ensureProfile(userId: string) {
  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) {
    console.error("[auth_supabase] ensureProfile select error:", selErr.message);
    throw selErr;
  }

  if (existing) {
    console.log("[auth_supabase] Profile exists for user:", userId);
    return existing;
  }

  console.log("[auth_supabase] Creating profile for user:", userId);
  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: userId })
    .select("*")
    .single();

  if (error) {
    console.error("[auth_supabase] ensureProfile insert error:", error.message);
    throw error;
  }

  return data;
}

/**
 * Update active society / member pointers on the profile.
 */
export async function updateActiveSociety(params: {
  userId: string;
  activeSocietyId: string | null;
  activeMemberId: string | null;
}) {
  console.log("[auth_supabase] updateActiveSociety:", params);

  const { error } = await supabase
    .from("profiles")
    .update({
      active_society_id: params.activeSocietyId,
      active_member_id: params.activeMemberId,
    })
    .eq("id", params.userId);

  if (error) {
    console.error("[auth_supabase] updateActiveSociety error:", error.message);
    throw error;
  }
}
