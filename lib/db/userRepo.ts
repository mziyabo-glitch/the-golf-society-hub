// lib/db/userRepo.ts
import { supabase } from "@/lib/supabase";

/**
 * User document shape (profile-backed)
 */
export type UserDoc = {
  uid: string;
  activeSocietyId: string | null;
  activeMemberId: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function mapUser(row: any): UserDoc {
  return {
    uid: row.id,
    activeSocietyId: row.active_society_id ?? null,
    activeMemberId: row.active_member_id ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Ensure profiles/{uid} exists
 */
export async function ensureUserDoc(uid: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: uid }, { onConflict: "id" });

  if (error) {
    throw new Error(error.message || "Failed to ensure profile");
  }
}

/**
 * Read profiles/{uid}
 */
export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load profile");
  }
  return data ? mapUser(data) : null;
}

/**
 * Subscribe to profiles/{uid} (polling).
 */
export function subscribeUserDoc(
  uid: string,
  onNext: (user: UserDoc | null) => void,
  onError?: (err: unknown) => void
): () => void {
  let active = true;

  const fetchOnce = async () => {
    try {
      const doc = await getUserDoc(uid);
      if (active) onNext(doc);
    } catch (err) {
      if (active) {
        if (onError) onError(err);
        else console.error("subscribeUserDoc error", err);
      }
    }
  };

  fetchOnce();
  const timer = setInterval(fetchOnce, 5000);

  return () => {
    active = false;
    clearInterval(timer);
  };
}

/**
 * Update profile row
 */
export async function updateUserDoc(uid: string, updates: Partial<UserDoc>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.activeSocietyId !== undefined) payload.active_society_id = updates.activeSocietyId;
  if (updates.activeMemberId !== undefined) payload.active_member_id = updates.activeMemberId;

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from("profiles").update(payload).eq("id", uid);
  if (error) {
    throw new Error(error.message || "Failed to update profile");
  }
}

/**
 * Set active society + member
 */
export async function setActiveSocietyAndMember(
  uid: string,
  societyId: string,
  memberId: string
): Promise<void> {
  await updateUserDoc(uid, {
    activeSocietyId: societyId,
    activeMemberId: memberId,
  });
}

/**
 * Reset society (leave / reset flow)
 */
export async function clearActiveSociety(uid: string): Promise<void> {
  await updateUserDoc(uid, {
    activeSocietyId: null,
    activeMemberId: null,
  });
}

/**
 * Convenience wrappers
 */
export async function setActiveSociety(uid: string, societyId: string | null) {
  await updateUserDoc(uid, { activeSocietyId: societyId ?? null });
}

export async function setActiveMember(uid: string, memberId: string | null) {
  await updateUserDoc(uid, { activeMemberId: memberId ?? null });
}
