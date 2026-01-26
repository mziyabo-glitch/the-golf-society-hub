// lib/db_supabase/memberRepo.ts
import { supabase } from "@/lib/supabase";

export type MemberDoc = {
  id: string;
  society_id: string;
  user_id?: string | null;
  display_name?: string;
  name?: string;
  email?: string;
  handicap?: number | null;
  sex?: "male" | "female";
  status?: string;
  roles?: string[];
  created_at?: string;
  updated_at?: string;
  paid?: boolean;
  amount_paid?: number;
  paid_date?: string | null;
};

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
  }
): Promise<string> {
  if (!societyId) throw new Error("createMember: missing societyId");

  const safe = data ?? {};
  const roles =
    Array.isArray(safe.roles) && safe.roles.length > 0 ? safe.roles : ["member"];

  // Minimal payload - only essential columns
  const payload: Record<string, unknown> = {
    society_id: societyId,
    user_id: safe.userId ?? null,
    display_name: safe.displayName ?? safe.name ?? "Member",
    roles,
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
  return data;
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
    throw new Error(error.message || "Failed to get members");
  }
  return data ?? [];
}

/**
 * Update member document
 */
export async function updateMemberDoc(
  memberId: string,
  updates: Partial<Omit<MemberDoc, "id">>
): Promise<void> {
  const { error } = await supabase
    .from("members")
    .update({ ...updates, updated_at: new Date().toISOString() })
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
