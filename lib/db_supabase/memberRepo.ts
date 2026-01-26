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
    handicap?: number | null;
    sex?: "male" | "female";
    status?: string;
    email?: string;
    paid?: boolean;
    amountPaid?: number;
    paidDate?: string | null;
  }
): Promise<string> {
  if (!societyId) throw new Error("createMember: missing societyId");

  const safe = data ?? {};
  const roles =
    Array.isArray(safe.roles) && safe.roles.length > 0 ? safe.roles : ["member"];

  const payload = {
    society_id: societyId,
    user_id: safe.userId ?? null,
    display_name: safe.displayName ?? safe.name ?? "Member",
    name: safe.name ?? null,
    email: safe.email ?? null,
    handicap: safe.handicap ?? null,
    sex: safe.sex ?? null,
    status: safe.status ?? "active",
    roles,
    paid: safe.paid ?? false,
    amount_paid: safe.amountPaid ?? 0,
    paid_date: safe.paidDate ?? null,
  };

  const { data: row, error } = await supabase
    .from("members")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
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

  if (error) throw error;
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

  if (error) throw error;
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

  if (error) throw error;
}

/**
 * Delete a member
 */
export async function deleteMember(memberId: string): Promise<void> {
  if (!memberId) throw new Error("deleteMember: missing memberId");

  const { error } = await supabase.from("members").delete().eq("id", memberId);

  if (error) throw error;
}
