// lib/db_supabase/profileRepo.ts
// Profile management - uses singleton supabase client
// NO .select().single() after upsert to avoid 406 errors

import { supabase } from "@/lib/supabase";

export type ProfileDoc = {
  id: string;
  active_society_id: string | null;
  active_member_id: string | null;
  created_at?: string;
  updated_at?: string;
};

/**
 * Ensure profile exists for user.
 * Uses upsert WITHOUT .select().single() to avoid 406 errors,
 * then fetches with .maybeSingle().
 */
export async function ensureProfile(userId: string): Promise<ProfileDoc> {
  console.log("[profileRepo] ensureProfile for:", userId);

  // Step 1: Upsert WITHOUT .select().single()
  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(
      { id: userId },
      { onConflict: "id" }
    );

  if (upsertError) {
    console.error("[profileRepo] upsert failed:", {
      message: upsertError.message,
      details: upsertError.details,
      hint: upsertError.hint,
      code: upsertError.code,
    });
    // Don't throw - profile might already exist, continue to fetch
  }

  // Step 2: Fetch profile with .maybeSingle()
  const { data, error: selectError } = await supabase
    .from("profiles")
    .select("id, active_society_id, active_member_id, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    console.error("[profileRepo] select failed:", {
      message: selectError.message,
      details: selectError.details,
      hint: selectError.hint,
      code: selectError.code,
    });
    throw new Error(selectError.message || "Failed to load profile");
  }

  if (!data) {
    // This shouldn't happen after upsert, but handle gracefully
    console.error("[profileRepo] No profile found after upsert");
    throw new Error("Profile not found");
  }

  console.log("[profileRepo] ensureProfile success:", data.id);
  return data;
}

/**
 * Get profile by user ID
 */
export async function getProfile(userId: string): Promise<ProfileDoc | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, active_society_id, active_member_id, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[profileRepo] getProfile failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to get profile");
  }
  return data;
}

/**
 * Update profile fields
 */
export async function updateProfile(
  userId: string,
  updates: Partial<Omit<ProfileDoc, "id">>
): Promise<void> {
  console.log("[profileRepo] updateProfile:", userId, JSON.stringify(updates, null, 2));

  const { error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    console.error("[profileRepo] updateProfile failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to update profile");
  }
}

/**
 * Set active society + member
 * Called after Create Society or Join Society
 */
export async function setActiveSocietyAndMember(
  userId: string,
  societyId: string,
  memberId: string
): Promise<void> {
  console.log("[profileRepo] setActiveSocietyAndMember:", { userId, societyId, memberId });
  await updateProfile(userId, {
    active_society_id: societyId,
    active_member_id: memberId,
  });
}

/**
 * Reset society (leave / reset flow)
 */
export async function clearActiveSociety(userId: string): Promise<void> {
  await updateProfile(userId, {
    active_society_id: null,
    active_member_id: null,
  });
}
