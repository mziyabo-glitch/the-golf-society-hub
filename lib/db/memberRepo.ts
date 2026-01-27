// lib/db/memberRepo.ts
import { supabase } from "@/lib/supabase";

export type MemberDoc = {
  id: string;
  societyId: string;
  userId?: string | null;

  displayName?: string;
  name?: string;
  email?: string;
  handicap?: number | null;
  sex?: "male" | "female";
  status?: string;

  role?: string | null;
  roles?: string[];
  createdAt?: string | null;
  updatedAt?: string | null;

  paid?: boolean;
  amountPaid?: number;
  amountPaidPence?: number;
  paidDate?: string | null;
};

type MemberInsert = {
  society_id: string;
  user_id?: string | null;
  name: string;
  display_name?: string | null;
  email?: string | null;
  role?: string | null;
  status?: string | null;
  handicap?: number | null;
  sex?: "male" | "female" | null;
};

function normalizeRoles(raw: unknown): string[] {
  const roles = new Set<string>();
  if (Array.isArray(raw)) {
    raw.forEach((r) => {
      if (typeof r === "string" && r.trim()) roles.add(r.toLowerCase().trim());
    });
  } else if (typeof raw === "string" && raw.trim()) {
    roles.add(raw.toLowerCase().trim());
  }
  roles.add("member");
  return Array.from(roles);
}

function pickPrimaryRole(raw: unknown): string {
  const roles = normalizeRoles(raw);
  const priority = ["captain", "treasurer", "secretary", "handicapper", "member"];
  for (const role of priority) {
    if (roles.includes(role)) return role;
  }
  return roles[0] ?? "member";
}

function mapMember(row: any): MemberDoc {
  const roles = normalizeRoles(row.roles ?? row.role);
  return {
    id: row.id,
    societyId: row.society_id,
    userId: row.user_id ?? null,
    name: row.name ?? undefined,
    displayName: row.display_name ?? row.name ?? undefined,
    email: row.email ?? undefined,
    handicap: row.handicap ?? null,
    sex: row.sex ?? undefined,
    status: row.status ?? undefined,
    role: row.role ?? null,
    roles,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    paid: row.paid ?? false,
    amountPaid: row.amount_paid_pence ?? row.amount_paid ?? undefined,
    amountPaidPence: row.amount_paid_pence ?? undefined,
    paidDate: row.paid_at ?? null,
  };
}

async function adminAddMember(payload: MemberInsert): Promise<MemberDoc> {
  const { data, error } = await supabase.rpc("admin_add_member", {
    p_society_id: payload.society_id,
    p_user_id: payload.user_id ?? null,
    p_name: payload.name,
    p_display_name: payload.display_name ?? payload.name,
    p_email: payload.email ?? null,
    p_role: payload.role ?? "member",
  });

  if (error) {
    throw new Error(error.message || "Failed to create member (admin)");
  }
  return mapMember(data);
}

async function adminUpdateMember(memberId: string, updates: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc("admin_update_member", {
    p_member_id: memberId,
    p_updates: updates,
  });

  if (error) {
    throw new Error(error.message || "Failed to update member (admin)");
  }
}

async function adminDeleteMember(memberId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_delete_member", {
    p_member_id: memberId,
  });

  if (error) {
    throw new Error(error.message || "Failed to delete member (admin)");
  }
}

/**
 * Used by create-society / add-member flows
 * Creates a new member in "members" table and returns the new memberId.
 *
 * IMPORTANT: userId is optional - only pass it for the signed-in user's own member row.
 */
export async function createMember(
  input:
    | MemberInsert
    | (Partial<Omit<MemberDoc, "id" | "societyId">> & {
        societyId: string;
        userId?: string;
        roles?: string[];
      })
    | string,
  data?: Partial<Omit<MemberDoc, "id" | "societyId">> & {
    displayName?: string;
    name?: string;
    roles?: string[];
    userId?: string;
    email?: string;
  }
): Promise<string> {
  let payload: MemberInsert;

  if (typeof input === "string") {
    const societyId = input;
    if (!societyId) throw new Error("createMember: missing societyId");
    const safe = data ?? {};
    payload = {
      society_id: societyId,
      user_id: safe.userId ?? null,
      name: safe.name ?? safe.displayName ?? "Member",
      display_name: safe.displayName ?? safe.name ?? "Member",
      email: safe.email ?? null,
      role: pickPrimaryRole(safe.roles),
      status: safe.status ?? "active",
      handicap: safe.handicap ?? null,
      sex: safe.sex ?? null,
    };
  } else if ("societyId" in input) {
    const safe = input;
    payload = {
      society_id: safe.societyId,
      user_id: safe.userId ?? null,
      name: safe.name ?? safe.displayName ?? "Member",
      display_name: safe.displayName ?? safe.name ?? "Member",
      email: safe.email ?? null,
      role: pickPrimaryRole(safe.roles),
      status: safe.status ?? "active",
      handicap: safe.handicap ?? null,
      sex: safe.sex ?? null,
    };
  } else {
    payload = {
      society_id: input.society_id,
      user_id: input.user_id ?? null,
      name: input.name,
      display_name: input.display_name ?? input.name,
      email: input.email ?? null,
      role: pickPrimaryRole(input.role),
      status: input.status ?? "active",
      handicap: input.handicap ?? null,
      sex: input.sex ?? null,
    };
  }

  if (!payload.society_id) throw new Error("createMember: missing society_id");

  if (!payload.user_id) {
    const adminRow = await adminAddMember(payload);
    return adminRow.id;
  }

  const { data: row, error } = await supabase
    .from("members")
    .insert({
      society_id: payload.society_id,
      user_id: payload.user_id,
      name: payload.name,
      display_name: payload.display_name ?? payload.name,
      email: payload.email ?? null,
      role: payload.role ?? "member",
      status: payload.status ?? "active",
      handicap: payload.handicap ?? null,
      sex: payload.sex ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      const adminRow = await adminAddMember(payload);
      return adminRow.id;
    }
    throw new Error(error.message || "Failed to create member");
  }

  return row.id;
}

/**
 * Subscribe a single member row by ID.
 */
export function subscribeMemberDoc(
  memberId: string,
  onNext: (doc: MemberDoc | null) => void,
  onError?: (err: any) => void
): () => void {
  let active = true;

  const fetchOnce = async () => {
    try {
      const doc = await getMember(memberId);
      if (active) onNext(doc);
    } catch (err) {
      if (active) {
        if (onError) onError(err);
        else console.error("subscribeMemberDoc error", err);
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
 * Subscribe members for a society (polling).
 */
export function subscribeMembersBySociety(
  societyId: string,
  onNext: (docs: MemberDoc[]) => void,
  onError?: (err: any) => void
): () => void {
  let active = true;

  const fetchOnce = async () => {
    try {
      const docs = await getMembersBySocietyId(societyId);
      if (active) onNext(docs);
    } catch (err) {
      if (active) {
        if (onError) onError(err);
        else console.error("subscribeMembersBySociety error", err);
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
 * One-shot fetch.
 */
export async function getMembersBySocietyId(societyId: string): Promise<MemberDoc[]> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("society_id", societyId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load members");
  }
  return (data ?? []).map(mapMember);
}

/**
 * Alias requested by migration layer.
 */
export async function listMembers(societyId: string): Promise<MemberDoc[]> {
  return getMembersBySocietyId(societyId);
}

export async function listMembersBySociety(societyId: string): Promise<MemberDoc[]> {
  return getMembersBySocietyId(societyId);
}

function buildMemberUpdatePayload(updates: Partial<MemberDoc>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (updates.displayName !== undefined) payload.display_name = updates.displayName;
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.handicap !== undefined) payload.handicap = updates.handicap;
  if (updates.sex !== undefined) payload.sex = updates.sex;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.roles !== undefined) payload.role = pickPrimaryRole(updates.roles);
  if (updates.paid !== undefined) payload.paid = updates.paid;
  if (updates.paidDate !== undefined) payload.paid_at = updates.paidDate;
  if (updates.amountPaidPence !== undefined) payload.amount_paid_pence = updates.amountPaidPence;
  if (updates.amountPaid !== undefined && updates.amountPaidPence === undefined) {
    payload.amount_paid_pence = updates.amountPaid;
  }
  return payload;
}

/**
 * Update member row safely.
 */
export async function updateMemberDoc(
  societyIdOrMemberId: string,
  memberIdOrUpdates: string | Partial<MemberDoc>,
  updatesMaybe?: Partial<MemberDoc>
): Promise<void> {
  const memberId =
    typeof memberIdOrUpdates === "string" ? memberIdOrUpdates : societyIdOrMemberId;
  const updates =
    typeof memberIdOrUpdates === "string" ? updatesMaybe ?? {} : memberIdOrUpdates;

  const payload = buildMemberUpdatePayload(updates);
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from("members")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (!error) return;

  if (error.code === "42501" || error.message?.includes("row-level security")) {
    await adminUpdateMember(memberId, payload);
    return;
  }

  throw new Error(error.message || "Failed to update member");
}

/**
 * Captain/Treasurer can remove a member.
 */
export async function deleteMember(memberId: string): Promise<void> {
  if (!memberId) throw new Error("deleteMember: missing memberId");

  const { error } = await supabase.from("members").delete().eq("id", memberId);
  if (!error) return;

  if (error.code === "42501" || error.message?.includes("row-level security")) {
    await adminDeleteMember(memberId);
    return;
  }

  throw new Error(error.message || "Failed to delete member");
}

/**
 * Helper: read a member.
 */
export async function getMember(memberId: string): Promise<MemberDoc | null> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load member");
  }
  return data ? mapMember(data) : null;
}

/**
 * Backwards-compatible alias.
 */
export async function getMemberDoc(memberId: string): Promise<MemberDoc | null> {
  return getMember(memberId);
}
