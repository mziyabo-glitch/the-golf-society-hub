// lib/db_supabase/memberRepo.ts
import { supabase } from "@/lib/supabase";

export type MemberDoc = {
  id: string;
  society_id: string;
  user_id?: string | null;
  name?: string;
  displayName?: string; // alias for name
  email?: string;
  handicap?: number | null;
  role?: string;
  roles?: string[]; // computed from role for compatibility
  paid?: boolean;
  paid_date?: string | null;
  created_at?: string;
  updated_at?: string;
};

function mapMember(row: any): MemberDoc {
  return {
    ...row,
    displayName: row.name,
    roles: row.role ? [row.role] : ["member"],
  };
}

/**
 * Creates a new member in "members" table and returns the new memberId.
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
  if (!societyId) throw new Error("createMember: missing societyId");

  const safe = data ?? {};

  // Use first role or default to "member"
  const role = Array.isArray(safe.roles) && safe.roles.length > 0
    ? safe.roles[0]
    : "member";

  const name = safe.displayName ?? safe.name ?? "Member";

  const payload: Record<string, unknown> = {
    society_id: societyId,
    user_id: safe.userId ?? null,
    name: name,
    role: role,
    email: safe.email ?? null,
  };

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
    throw new Error(error.message || "Failed to create member");
  }

  console.log("[memberRepo] createMember success:", row?.id);
  return row.id;
}

/**
 * Get a single member by ID
 */
export async function getMember(memberId: string): Promise<MemberDoc | null> {
  const { data, error } = await supabase
    .from("members")
    .select(
      "id, society_id, user_id, name, display_name, email, handicap, sex, status, role, created_at, updated_at, paid, amount_paid_pence, paid_at"
    )
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
    .select(
      "id, society_id, user_id, name, display_name, email, handicap, sex, status, role, created_at, updated_at, paid, amount_paid_pence, paid_at"
    )
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
 * Note: societyId param is for API compatibility but not used
 */
export async function updateMemberDoc(
  _societyId: string,
  memberId: string,
  updates: Partial<{
    displayName: string;
    name: string;
    email: string;
    handicap: number | null;
    role: string;
    paid: boolean;
    paidDate: string | null;
  }>
): Promise<void> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.displayName !== undefined) payload.name = updates.displayName;
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.handicap !== undefined) payload.handicap = updates.handicap;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.paid !== undefined) payload.paid = updates.paid;
  if (updates.paidDate !== undefined) payload.paid_date = updates.paidDate;

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
