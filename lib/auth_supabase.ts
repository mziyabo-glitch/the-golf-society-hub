// lib/auth_supabase.ts
// Auth helper functions using singleton supabase client
// All auth uses supabase-js, no manual fetch calls
// NO .select().single() after upsert to avoid 406 errors

import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

// ============================================================================
// Session Management
// ============================================================================

/**
 * Get the current session (from memory/localStorage)
 */
export async function getSession(): Promise<Session | null> {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error("[auth] getSession error:", error.message);
    return null;
  }

  return session;
}

/**
 * Get the current user from the session
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error("[auth] getCurrentUser error:", error.message);
    return null;
  }

  return user;
}

// ============================================================================
// Sign In / Sign Up / Sign Out
// ============================================================================

/**
 * Sign in with email and password.
 * Returns the user on success, throws on error.
 * Surfaces the real Supabase error message for debugging.
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const cleanEmail = email.trim().toLowerCase();
  console.log("[auth] signInWithEmail", { step: "signIn", email: cleanEmail });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (error) {
    console.error("[auth] signInWithEmail error:", {
      step: "signIn",
      email: cleanEmail,
      code: error.status,
      message: error.message,
      name: error.name,
    });
    throw new Error(error.message || "Sign in failed.");
  }

  if (!data.user) {
    throw new Error("Sign in failed — no user returned.");
  }

  console.log("[auth] signInWithEmail success:", data.user.id);
  return data.user;
}

/**
 * Sign up with email and password.
 * Returns the user on success, throws on error.
 * Surfaces the real Supabase error message for debugging.
 */
export async function signUpWithEmail(email: string, password: string): Promise<{ user: User; needsConfirmation: boolean }> {
  const cleanEmail = email.trim().toLowerCase();
  console.log("[auth] signUpWithEmail", { step: "signUp", email: cleanEmail });

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
  });

  if (error) {
    console.error("[auth] signUpWithEmail error:", {
      step: "signUp",
      email: cleanEmail,
      code: error.status,
      message: error.message,
      name: error.name,
    });
    throw new Error(error.message || "Sign up failed.");
  }

  if (!data.user) {
    throw new Error("Sign up failed — no user returned.");
  }

  console.log("[auth] signUpWithEmail response:", {
    step: "signUp",
    email: cleanEmail,
    userId: data.user.id,
    identitiesCount: data.user.identities?.length ?? "N/A",
    hasSession: !!data.session,
    confirmedAt: data.user.confirmed_at ?? "not confirmed",
  });

  // Supabase quirk: when email confirmations are ON and the email already
  // exists, signUp returns a user object with an empty identities array
  // instead of an error.
  if (data.user.identities && data.user.identities.length === 0) {
    throw new Error("An account with this email already exists. Try signing in instead.");
  }

  // If no session came back, the user needs to confirm their email first.
  const needsConfirmation = !data.session;

  return { user: data.user, needsConfirmation };
}

/**
 * Send a password reset email.
 * Supabase will send a link to the user's email.
 * Uses the stable production URL so the redirect always matches the
 * Supabase allowlist (preview URLs change per Vercel deployment).
 */
const RESET_REDIRECT_URL = "https://the-golf-society-hub.vercel.app/reset-password";

export async function resetPassword(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();

  console.log("[auth] resetPassword", {
    email: cleanEmail,
    redirectTo: RESET_REDIRECT_URL,           // beta: verify correct URL
  });

  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: RESET_REDIRECT_URL,
  });

  if (error) {
    console.error("[auth] resetPassword error:", {
      email: cleanEmail,
      code: error.status,
      message: error.message,
    });
    throw new Error(error.message || "Failed to send reset email.");
  }

  console.log("[auth] resetPassword email sent to:", cleanEmail);
}

/**
 * Ensure user is signed in. If no session exists, throw.
 * Returns the user object.
 */
export async function ensureSignedIn(): Promise<User> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error("[auth] getSession error:", sessionError.message);
  }

  if (session?.user) {
    console.log("[auth] Existing session for user:", session.user.id);
    return session.user;
  }

  throw new Error("Not signed in. Please use the email link to sign in.");
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("[auth] signOut error:", error.message);
    throw new Error(`Sign out failed: ${error.message}`);
  }

  console.log("[auth] Signed out successfully");
}

// ============================================================================
// Profile Management
// ============================================================================

/**
 * Ensure a profile row exists for the user.
 * Uses upsert WITHOUT .select().single() to avoid 406 errors,
 * then fetches separately with .maybeSingle()
 */
export async function ensureProfile(userId: string): Promise<any> {
  console.log("[auth] Ensuring profile for:", userId);

  // Step 1: Upsert WITHOUT .select().single()
  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(
      { id: userId },
      { onConflict: "id" }
    );

  if (upsertError) {
    console.warn("[auth] Profile upsert warning:", upsertError.message);
    // Don't throw - profile might already exist
  }

  // Step 2: Fetch profile with .maybeSingle()
  const { data, error: selectError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    console.error("[auth] Profile select error:", selectError.message);
    throw new Error(`Failed to load profile: ${selectError.message}`);
  }

  if (!data) {
    console.error("[auth] No profile found after upsert");
    throw new Error("Profile not found");
  }

  console.log("[auth] Profile loaded:", data.id);
  return data;
}

/**
 * Update active society and member on the profile
 */
export async function updateActiveSociety(params: {
  userId: string;
  activeSocietyId: string | null;
  activeMemberId: string | null;
}): Promise<void> {
  console.log("[auth] updateActiveSociety:", params);

  const { error } = await supabase
    .from("profiles")
    .update({
      active_society_id: params.activeSocietyId,
      active_member_id: params.activeMemberId,
    })
    .eq("id", params.userId);

  if (error) {
    console.error("[auth] updateActiveSociety error:", error.message);
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  console.log("[auth] updateActiveSociety success");
}

/**
 * Clear active society (for "leave society" flow)
 */
export async function clearActiveSociety(userId: string): Promise<void> {
  await updateActiveSociety({
    userId,
    activeSocietyId: null,
    activeMemberId: null,
  });
}

// ============================================================================
// Auth State Verification
// ============================================================================

/**
 * Verify that the current auth state matches expected user ID.
 * Useful before operations that require auth.uid() to match a specific user.
 */
export async function verifyAuthState(expectedUserId: string): Promise<void> {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error("[auth] verifyAuthState error:", error.message);
    throw new Error(`Auth verification failed: ${error.message}`);
  }

  if (!user) {
    throw new Error("No authenticated user");
  }

  if (user.id !== expectedUserId) {
    console.error("[auth] User ID mismatch:", { expected: expectedUserId, actual: user.id });
    throw new Error("Auth state mismatch");
  }

  console.log("[auth] Auth state verified for:", user.id);
}
