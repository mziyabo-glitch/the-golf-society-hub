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
// Sign In / Sign Out
// ============================================================================

/**
 * Sign in with email and password.
 * Returns the user on success, throws on error.
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    console.error("[auth] signInWithEmail error:", error.message);

    if (error.message?.includes("Invalid login credentials")) {
      throw new Error("Incorrect email or password.");
    }
    if (error.message?.includes("Email not confirmed")) {
      throw new Error("Please check your email and confirm your account first.");
    }
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
 *
 * Note: If email confirmation is enabled in Supabase, the user will need
 * to verify their email before they can sign in. We detect this and
 * provide a helpful message.
 */
export async function signUpWithEmail(email: string, password: string): Promise<{ user: User; needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    console.error("[auth] signUpWithEmail error:", error.message);

    if (error.message?.includes("already registered")) {
      throw new Error("An account with this email already exists. Try signing in instead.");
    }
    if (error.message?.includes("Password should be")) {
      throw new Error("Password must be at least 6 characters.");
    }
    throw new Error(error.message || "Sign up failed.");
  }

  if (!data.user) {
    throw new Error("Sign up failed — no user returned.");
  }

  // If identities array is empty, the user already exists (Supabase returns
  // a fake user with no identities instead of an error in some configs)
  if (data.user.identities && data.user.identities.length === 0) {
    throw new Error("An account with this email already exists. Try signing in instead.");
  }

  // Check if email confirmation is required
  const needsConfirmation = !data.session;

  console.log("[auth] signUpWithEmail success:", data.user.id, "needsConfirmation:", needsConfirmation);
  return { user: data.user, needsConfirmation };
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
