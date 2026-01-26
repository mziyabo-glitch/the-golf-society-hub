// lib/db_supabase/profileRepo.ts
import { supabase } from "@/lib/supabase";

export type ProfileDoc = {
  id: string;
  active_society_id: string | null;
  active_member_id: string | null;
  created_at?: string;
  updated_at?: string;
};

/**
 * Ensure profile exists for user
 */
export async function ensureProfile(userId: string): Promise<ProfileDoc> {
  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) {
    console.error("[profileRepo] ensureProfile select failed:", {
      message: selErr.message,
      details: selErr.details,
      hint: selErr.hint,
      code: selErr.code,
    });
    throw new Error(selErr.message || "Failed to check profile");
  }

  if (existing) return existing;

  console.log("[profileRepo] Creating new profile for:", userId);

  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: userId })
    .select()
    .single();

  if (error) {
    console.error("[profileRepo] ensureProfile insert failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to create profile");
  }

  return data;
}

/**
 * Get profile by user ID
 */
export async function getProfile(userId: string): Promise<ProfileDoc | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
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
