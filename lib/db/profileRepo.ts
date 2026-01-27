// lib/db/profileRepo.ts
import { supabase, requireSupabaseSession } from "@/lib/supabase";

export type ProfileDoc = {
  id: string;
  active_society_id: string | null;
  active_member_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/**
 * Ensure profile exists for user.
 * Uses upsert with .select().single() (id is PK).
 */
export async function ensureProfile(userId: string): Promise<ProfileDoc> {
  await requireSupabaseSession("profileRepo.ensureProfile");
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: userId }, { onConflict: "id" })
    .select("id, active_society_id, active_member_id, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to ensure profile");
  }

  return data;
}

/**
 * Get profile by user ID
 */
export async function getProfile(userId: string): Promise<ProfileDoc | null> {
  await requireSupabaseSession("profileRepo.getProfile");
  const { data, error } = await supabase
    .from("profiles")
    .select("id, active_society_id, active_member_id, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load profile");
  }
  return data;
}

/**
 * Update profile fields
 */
export async function updateProfile(
  userId: string,
  updates: Partial<{
    active_society_id: string | null;
    active_member_id: string | null;
    activeSocietyId: string | null;
    activeMemberId: string | null;
  }>
): Promise<void> {
  await requireSupabaseSession("profileRepo.updateProfile");
  const payload: Record<string, unknown> = {};
  if (updates.active_society_id !== undefined) payload.active_society_id = updates.active_society_id;
  if (updates.active_member_id !== undefined) payload.active_member_id = updates.active_member_id;
  if (updates.activeSocietyId !== undefined) payload.active_society_id = updates.activeSocietyId;
  if (updates.activeMemberId !== undefined) payload.active_member_id = updates.activeMemberId;

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from("profiles").update(payload).eq("id", userId);

  if (error) {
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
