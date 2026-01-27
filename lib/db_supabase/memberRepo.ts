// lib/db_supabase/memberRepo.ts
// Member management - uses singleton supabase client
// IMPORTANT: Only send columns that exist in the members table:
// id, society_id, user_id, name, email, role, paid, amount_paid_pence, paid_at, created_at, display_name

import { supabase } from "@/lib/supabase";

export type MemberDoc = {
  id: string;
  society_id: string;
  user_id?: string | null;
  name?: string;
  display_name?: string;
  displayName?: string; // alias for name (camelCase for app compatibility)
  email?: string;
  role?: string;
  roles?: string[]; // computed from role for compatibility
  paid?: boolean;
  amount_paid_pence?: number;
  paid_at?: string | null;
  created_at?: string;
};

function mapMember(row: any): MemberDoc {
  return {
    ...row,
    displayName: row.name || row.display_name,
    roles: row.role ? [row.role] : ["member"],
  };
}

/**
 * Creates a new member in "members" table and returns the new memberId.
 * Only sends valid columns: society_id, user_id, name, email, role, paid, amount_paid_pence
 */
export async function createMember(
  societyId: string,
  data?: {
    displayName?: string;
    name?: string;
    roles?: string[];
    userId?: string;
    email?: string;
  }
): Promise<string> {
  console.log("[onboarding] createMember start");

  if (!societyId) throw new Error("createMember: missing societyId");

  const safe = data ?? {};

  // Use first role or default to "member"
  const role = Array.isArray(safe.roles) && safe.roles.length > 0
    ? safe.roles[0]
    : "member";

  const name = safe.displayName ?? safe.name ?? "Member";

  // ONLY send columns that exist in the members table
  const payload: Record<string, unknown> = {
    society_id: societyId,
    user_id: safe.userId ?? null,
    name: name,
    role: role,
    paid: false,
    amount_paid_pence: 0,
  };

  // Only add email if provided
  if (safe.email) {
    payload.email = safe.email;
  }

  console.log("[memberRepo] createMember payload:", JSON.stringify(payload, null, 2));

  const { data: row, error } = await supabase
    .from("members")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error("[memberRepo] createMember failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Provide helpful error for RLS failures
    if (error.code === "42501" || error.code === "403" || error.message?.includes("row-level security")) {
      throw new Error("Permission denied. You can only add yourself as a member.");
    }

    throw new Error(error.message || "Failed to create member");
  }

  console.log("[onboarding] createMember success:", row?.id);
  return row.id;
}

/**
 * Find existing membership for a user in a society
 * Returns the member if found, null otherwise
 */
export async function findMemberByUserAndSociety(
  societyId: string,
  userId: string
): Promise<MemberDoc | null> {
  console.log("[memberRepo] findMemberByUserAndSociety:", { societyId, userId });

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("society_id", societyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[memberRepo] findMemberByUserAndSociety failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    // Don't throw - just return null if we can't find it
    return null;
  }

  if (data) {
    console.log("[memberRepo] Found existing membership:", data.id);
    return mapMember(data);
  }

  console.log("[memberRepo] No existing membership found");
  return null;
}

/**
 * Get a single member by ID
 */
export async function getMember(memberId: string): Promise<MemberDoc | null> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    console.error("[memberRepo] getMember failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to get member");
  }
  return data ? mapMember(data) : null;
}

/**
 * Get members for a society
 */
export async function getMembersBySocietyId(
  societyId: string
): Promise<MemberDoc[]> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("society_id", societyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[memberRepo] getMembersBySocietyId failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return [];
  }
  return (data ?? []).map(mapMember);
}

/**
 * Update member document
 * ONLY sends columns that exist in the members table
 * Note: societyId param is for API compatibility but not used
 */
export async function updateMemberDoc(
  _societyId: string,
  memberId: string,
  updates: Partial<{
    displayName: string;
    name: string;
    email: string;
    role: string;
    paid: boolean;
    amount_paid_pence: number;
    paid_at: string | null;
  }>
): Promise<void> {
  const payload: Record<string, unknown> = {};

  // Only include fields that exist in the DB schema
  if (updates.displayName !== undefined) payload.name = updates.displayName;
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.paid !== undefined) payload.paid = updates.paid;
  if (updates.amount_paid_pence !== undefined) payload.amount_paid_pence = updates.amount_paid_pence;
  if (updates.paid_at !== undefined) payload.paid_at = updates.paid_at;

  // Don't update if nothing to change
  if (Object.keys(payload).length === 0) {
    console.log("[memberRepo] updateMemberDoc: no valid fields to update");
    return;
  }

  console.log("[memberRepo] updateMemberDoc payload:", JSON.stringify(payload, null, 2));

  const { error } = await supabase
    .from("members")
    .update(payload)
    .eq("id", memberId);

  if (error) {
    console.error("[memberRepo] updateMemberDoc failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to update member");
  }
}

/**
 * Delete a member
 */
export async function deleteMember(memberId: string): Promise<void> {
  if (!memberId) throw new Error("deleteMember: missing memberId");

  const { error } = await supabase.from("members").delete().eq("id", memberId);

  if (error) {
    console.error("[memberRepo] deleteMember failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to delete member");
  }
}
