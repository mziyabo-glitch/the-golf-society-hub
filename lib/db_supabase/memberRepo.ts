// lib/db_supabase/memberRepo.ts
// Member management - uses singleton supabase client
// IMPORTANT: Only send columns that exist in the members table:
// id, society_id, user_id, name, email, role, paid, amount_paid_pence, paid_at, created_at, display_name, whs_number, handicap_index, gender
// annual_fee_paid, annual_fee_paid_at, annual_fee_note

import { supabase } from "@/lib/supabase";

export type Gender = "male" | "female" | null;

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
  // WHS / Handicap fields
  whs_number?: string | null;
  handicap_index?: number | null;
  whsNumber?: string | null; // camelCase alias
  handicapIndex?: number | null; // camelCase alias
  // Gender for tee selection
  gender?: Gender;
  // Annual membership fee tracking
  annual_fee_paid?: boolean;
  annual_fee_paid_at?: string | null;
  annual_fee_note?: string | null;
  // camelCase aliases for fee fields
  annualFeePaid?: boolean;
  annualFeePaidAt?: string | null;
  annualFeeNote?: string | null;
};

function mapMember(row: any): MemberDoc {
  return {
    ...row,
    displayName: row.name || row.display_name,
    roles: row.role ? [row.role] : ["member"],
    whsNumber: row.whs_number ?? null,
    handicapIndex: row.handicap_index ?? null,
    gender: row.gender ?? null,
    // Map fee fields to camelCase
    annualFeePaid: row.annual_fee_paid ?? false,
    annualFeePaidAt: row.annual_fee_paid_at ?? null,
    annualFeeNote: row.annual_fee_note ?? null,
  };
}

/**
 * Creates a new member in "members" table and returns the new memberId.
 * Only sends valid columns: society_id, user_id, name, email, role, paid, amount_paid_pence
 *
 * IMPORTANT: RLS policy only allows inserting where user_id = auth.uid() or user_id IS NULL.
 * This function validates that constraint before sending to prevent RLS errors.
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
  console.log("[memberRepo] createMember start");

  if (!societyId) throw new Error("createMember: missing societyId");

  // Verify auth state and validate user_id matches
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error("[memberRepo] Auth error:", authError.message);
    throw new Error("Authentication error: " + authError.message);
  }

  const authUid = authData?.user?.id;
  if (!authUid) {
    console.error("[memberRepo] No authenticated user found");
    throw new Error("You must be signed in to create a member record.");
  }

  const safe = data ?? {};

  // App-level safety: Ensure user_id matches auth.uid() (RLS enforces this too)
  if (safe.userId && safe.userId !== authUid) {
    console.error("[memberRepo] user_id mismatch - cannot create member for another user:", {
      providedUserId: safe.userId,
      authUid: authUid,
    });
    throw new Error("Permission denied. You can only add yourself as a member.");
  }

  // Use first role or default to "member"
  const role = Array.isArray(safe.roles) && safe.roles.length > 0
    ? safe.roles[0]
    : "member";

  const name = safe.displayName ?? safe.name ?? "Member";

  // ONLY send columns that exist in the members table
  // Always use auth.uid() as user_id for safety
  const payload: Record<string, unknown> = {
    society_id: societyId,
    user_id: authUid,
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

  console.log("[memberRepo] createMember success:", row?.id);
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
    throw new Error(error.message || "Failed to load members");
  }

  const members = (data ?? []).map(mapMember);
  console.log(
    "[memberRepo] getMembersBySocietyId returned",
    members.length,
    "members. Handicap values:",
    members.map((m) => ({ name: m.name, handicapIndex: m.handicapIndex, raw: m.handicap_index }))
  );
  return members;
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

/**
 * Add a member as Captain (uses RPC to bypass RLS)
 *
 * This function calls the `add_member_as_captain` Supabase RPC which:
 * - Validates the caller is a captain of the society
 * - Inserts a new member with user_id = NULL
 * - Returns the inserted member
 *
 * @param societyId - The society to add the member to
 * @param name - The member's display name
 * @param email - Optional email address
 * @param role - The member's role (defaults to 'member')
 * @returns The new member's data
 */
export async function addMemberAsCaptain(
  societyId: string,
  name: string,
  email?: string | null,
  role: string = "member"
): Promise<MemberDoc> {
  console.log("[memberRepo] addMemberAsCaptain RPC starting:", {
    societyId,
    name,
    email: email || "(none)",
    role,
  });

  if (!societyId) throw new Error("addMemberAsCaptain: missing societyId");
  if (!name || !name.trim()) throw new Error("addMemberAsCaptain: missing name");

  const { data, error } = await supabase.rpc("add_member_as_captain", {
    p_society_id: societyId,
    p_name: name.trim(),
    p_email: email?.trim() || null,
    p_role: role.toLowerCase(),
  });

  if (error) {
    console.error("[memberRepo] addMemberAsCaptain RPC error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Provide user-friendly error messages
    if (error.message?.includes("Only Captains")) {
      throw new Error("Only Captains can add members to the society.");
    }
    if (error.message?.includes("Not authenticated")) {
      throw new Error("Please sign in to add members.");
    }
    if (error.message?.includes("name is required")) {
      throw new Error("Member name is required.");
    }

    throw new Error(error.message || "Failed to add member");
  }

  // RPC returns an array with the inserted row
  const row = Array.isArray(data) ? data[0] : data;

  if (!row || !row.id) {
    console.error("[memberRepo] addMemberAsCaptain: no data returned");
    throw new Error("Failed to add member - no data returned");
  }

  console.log("[memberRepo] addMemberAsCaptain RPC success, member id:", row.id);

  return mapMember(row);
}

/**
 * Update a member's WHS number and handicap index (Captain/Handicapper only)
 *
 * This function calls the `update_member_handicap` Supabase RPC which:
 * - Validates the caller is a Captain or Handicapper of the society
 * - Updates the member's WHS number and handicap index
 * - Returns the updated member data
 *
 * @param memberId - The member to update
 * @param whsNumber - Optional WHS number (pass null to clear)
 * @param handicapIndex - Optional handicap index (pass null to clear)
 * @returns The updated member data
 */
export async function updateMemberHandicap(
  memberId: string,
  whsNumber?: string | null,
  handicapIndex?: number | null
): Promise<MemberDoc> {
  console.log("[memberRepo] updateMemberHandicap RPC starting:", {
    memberId,
    whsNumber: whsNumber ?? "(unchanged)",
    handicapIndex: handicapIndex ?? "(unchanged)",
  });

  if (!memberId) throw new Error("updateMemberHandicap: missing memberId");

  const { data, error } = await supabase.rpc("update_member_handicap", {
    p_member_id: memberId,
    p_whs_number: whsNumber,
    p_handicap_index: handicapIndex,
  });

  if (error) {
    console.error("[memberRepo] updateMemberHandicap RPC error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Provide user-friendly error messages
    if (error.message?.includes("Permission denied")) {
      throw new Error("Only Captain or Handicapper can update handicaps.");
    }
    if (error.message?.includes("Not authenticated")) {
      throw new Error("Please sign in to update handicaps.");
    }
    if (error.message?.includes("Member not found")) {
      throw new Error("Member not found.");
    }
    if (error.message?.includes("Handicap index must be")) {
      throw new Error("Handicap index must be between -10 and 54.");
    }

    throw new Error(error.message || "Failed to update handicap");
  }

  // RPC returns an array with the updated row
  const row = Array.isArray(data) ? data[0] : data;

  if (!row || !row.id) {
    console.error("[memberRepo] updateMemberHandicap: no data returned");
    throw new Error("Failed to update handicap - no data returned");
  }

  console.log("[memberRepo] updateMemberHandicap RPC success, member id:", row.id);

  return mapMember(row);
}

/**
 * Update a member (unified function)
 *
 * Updates member fields and optionally handicap data.
 * Throws on Supabase error and returns the updated member.
 *
 * @param memberId - The member to update
 * @param patch - Fields to update
 * @returns The updated member data
 */
export async function updateMember(
  memberId: string,
  patch: Partial<{
    name: string;
    displayName: string;
    email: string;
    whsNumber: string | null;
    handicapIndex: number | null;
    gender: Gender;
  }>
): Promise<MemberDoc> {
  console.log("[memberRepo] updateMember starting:", { memberId, patch });

  if (!memberId) throw new Error("updateMember: missing memberId");

  // Build payload for basic fields
  const basicPayload: Record<string, unknown> = {};

  if (patch.name !== undefined) basicPayload.name = patch.name;
  if (patch.displayName !== undefined) basicPayload.name = patch.displayName;
  if (patch.email !== undefined) basicPayload.email = patch.email;
  if (patch.gender !== undefined) basicPayload.gender = patch.gender;

  // Update basic fields if any
  if (Object.keys(basicPayload).length > 0) {
    console.log("[memberRepo] updateMember basic payload:", basicPayload);

    const { error } = await supabase
      .from("members")
      .update(basicPayload)
      .eq("id", memberId);

    if (error) {
      console.error("[memberRepo] updateMember basic fields failed:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error(error.message || "Failed to update member");
    }
  }

  // Update handicap fields if provided (uses RPC for permission check)
  const hasHandicapUpdate =
    patch.whsNumber !== undefined || patch.handicapIndex !== undefined;

  if (hasHandicapUpdate) {
    // Validate handicap range
    if (patch.handicapIndex !== undefined && patch.handicapIndex !== null) {
      if (patch.handicapIndex < -10 || patch.handicapIndex > 54) {
        throw new Error("Handicap index must be between -10 and 54.");
      }
    }

    return await updateMemberHandicap(
      memberId,
      patch.whsNumber,
      patch.handicapIndex
    );
  }

  // Fetch and return updated member
  const updated = await getMember(memberId);
  if (!updated) {
    throw new Error("Member not found after update");
  }

  console.log("[memberRepo] updateMember success:", updated.id);
  return updated;
}

// =====================================================
// MANCO ROLE HOLDERS
// =====================================================

export type ManCoRoleHolder = {
  role: string;
  name: string;
};

export type ManCoDetails = {
  captain: string | null;
  secretary: string | null;
  treasurer: string | null;
  handicapper: string | null;
};

/**
 * Get ManCo role holders for a society
 * Returns the name of each role holder, or null if not assigned
 * If multiple holders exist for a role, joins names with comma
 */
export async function getManCoRoleHolders(societyId: string): Promise<ManCoDetails> {
  console.log("[memberRepo] getManCoRoleHolders:", societyId);

  const { data, error } = await supabase
    .from("members")
    .select("name, role")
    .eq("society_id", societyId)
    .in("role", ["captain", "secretary", "treasurer", "handicapper"]);

  if (error) {
    console.error("[memberRepo] getManCoRoleHolders error:", error);
    return {
      captain: null,
      secretary: null,
      treasurer: null,
      handicapper: null,
    };
  }

  // Group by role
  const roleMap: Record<string, string[]> = {
    captain: [],
    secretary: [],
    treasurer: [],
    handicapper: [],
  };

  for (const member of data || []) {
    const role = member.role?.toLowerCase();
    if (role && roleMap[role]) {
      roleMap[role].push(member.name || "Unknown");
    }
  }

  return {
    captain: roleMap.captain.length > 0 ? roleMap.captain.join(", ") : null,
    secretary: roleMap.secretary.length > 0 ? roleMap.secretary.join(", ") : null,
    treasurer: roleMap.treasurer.length > 0 ? roleMap.treasurer.join(", ") : null,
    handicapper: roleMap.handicapper.length > 0 ? roleMap.handicapper.join(", ") : null,
  };
}

// =====================================================
// ANNUAL MEMBERSHIP FEE FUNCTIONS (Captain/Treasurer only)
// =====================================================

/**
 * Update a member's annual fee payment status
 * Only Captain or Treasurer can perform this action (enforced by RLS)
 *
 * @param memberId - The member to update
 * @param paid - Whether the fee is paid
 * @param note - Optional note about the payment
 * @returns The updated member data
 */
export async function updateMemberFeeStatus(
  memberId: string,
  paid: boolean,
  note?: string | null
): Promise<MemberDoc> {
  console.log("[memberRepo] updateMemberFeeStatus:", { memberId, paid, note });

  if (!memberId) throw new Error("updateMemberFeeStatus: missing memberId");

  const payload: Record<string, unknown> = {
    annual_fee_paid: paid,
    annual_fee_paid_at: paid ? new Date().toISOString().split("T")[0] : null,
  };

  // Only update note if provided (allow explicit null to clear)
  if (note !== undefined) {
    payload.annual_fee_note = note;
  }

  const { error } = await supabase
    .from("members")
    .update(payload)
    .eq("id", memberId);

  if (error) {
    console.error("[memberRepo] updateMemberFeeStatus failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Handle RLS permission errors
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      throw new Error("Only Captain or Treasurer can update fee status.");
    }

    throw new Error(error.message || "Failed to update fee status");
  }

  // Fetch and return updated member
  const updated = await getMember(memberId);
  if (!updated) {
    throw new Error("Member not found after update");
  }

  console.log("[memberRepo] updateMemberFeeStatus success:", memberId);
  return updated;
}

/**
 * Get fee summary for a society
 * Returns counts and totals for membership fee tracking
 *
 * @param societyId - The society to get summary for
 * @param annualFeePence - The annual fee amount in pence
 * @returns Fee summary with counts and amounts
 */
export type FeeSummary = {
  totalMembers: number;
  paidCount: number;
  unpaidCount: number;
  expectedPence: number;  // totalMembers * annualFeePence
  receivedPence: number;  // paidCount * annualFeePence
  outstandingPence: number; // unpaidCount * annualFeePence
};

export async function getMemberFeeSummary(
  societyId: string,
  annualFeePence: number
): Promise<FeeSummary> {
  console.log("[memberRepo] getMemberFeeSummary:", { societyId, annualFeePence });

  const { data, error } = await supabase
    .from("members")
    .select("id, annual_fee_paid")
    .eq("society_id", societyId);

  if (error) {
    console.error("[memberRepo] getMemberFeeSummary failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to get fee summary");
  }

  const members = data || [];
  const totalMembers = members.length;
  const paidCount = members.filter((m) => m.annual_fee_paid === true).length;
  const unpaidCount = totalMembers - paidCount;

  const fee = annualFeePence || 0;

  return {
    totalMembers,
    paidCount,
    unpaidCount,
    expectedPence: totalMembers * fee,
    receivedPence: paidCount * fee,
    outstandingPence: unpaidCount * fee,
  };
}

/**
 * Reset all members' annual fee status to unpaid
 * Useful at the start of a new membership year
 * Only Captain or Treasurer can perform this action (enforced by RLS)
 *
 * @param societyId - The society to reset fees for
 */
export async function resetAllMemberFees(societyId: string): Promise<void> {
  console.log("[memberRepo] resetAllMemberFees:", societyId);

  if (!societyId) throw new Error("resetAllMemberFees: missing societyId");

  const { error } = await supabase
    .from("members")
    .update({
      annual_fee_paid: false,
      annual_fee_paid_at: null,
      annual_fee_note: null,
    })
    .eq("society_id", societyId);

  if (error) {
    console.error("[memberRepo] resetAllMemberFees failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    if (error.code === "42501" || error.message?.includes("row-level security")) {
      throw new Error("Only Captain or Treasurer can reset fee status.");
    }

    throw new Error(error.message || "Failed to reset fees");
  }

  console.log("[memberRepo] resetAllMemberFees success");
}

export async function updateMemberRole(
  memberId: string,
  role: string
): Promise<MemberDoc> {
  if (!memberId) throw new Error("updateMemberRole: missing memberId");
  if (!role) throw new Error("updateMemberRole: missing role");

  const normalizedRole = role.toLowerCase();

  const { data, error } = await supabase
    .from("members")
    .update({ role: normalizedRole })
    .eq("id", memberId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[memberRepo] updateMemberRole failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    if (error.code === "42501" || error.message?.includes("row-level security")) {
      throw new Error("Only the Captain can change roles.");
    }

    throw new Error(error.message || "Failed to update member role");
  }

  if (!data) {
    throw new Error("Member not found after role update");
  }

  return mapMember(data);
}
