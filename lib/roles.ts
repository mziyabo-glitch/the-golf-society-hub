// lib/roles.ts
// Role management utilities using Supabase
// NO Firebase imports - uses singleton supabase client

import { supabase } from "@/lib/supabase";

export type MemberRole = "captain" | "treasurer" | "secretary" | "handicapper" | "member" | "admin";

export type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  roles?: string[];
};

// ============================================================================
// Role Normalization
// ============================================================================

const ROLE_CANONICAL: Record<string, MemberRole> = {
  // lowercase
  captain: "captain",
  treasurer: "treasurer",
  secretary: "secretary",
  handicapper: "handicapper",
  member: "member",
  admin: "admin",
  // Title Case (legacy)
  Captain: "captain",
  Treasurer: "treasurer",
  Secretary: "secretary",
  Handicapper: "handicapper",
  Member: "member",
  Admin: "admin",
};

export function normalizeRoleString(raw: unknown): MemberRole | null {
  if (typeof raw !== "string") return null;
  const direct = ROLE_CANONICAL[raw];
  if (direct) return direct;
  const lower = raw.toLowerCase();
  return (ROLE_CANONICAL[lower] ?? null) as MemberRole | null;
}

export function normalizeRolesArray(raw: unknown): MemberRole[] {
  const set = new Set<MemberRole>();
  set.add("member");

  if (!Array.isArray(raw)) {
    // Handle single role string (Supabase uses role text, not roles array)
    if (typeof raw === "string") {
      const normalized = normalizeRoleString(raw);
      if (normalized) set.add(normalized);
    }
    return Array.from(set);
  }

  for (const r of raw) {
    const normalized = normalizeRoleString(r);
    if (normalized) set.add(normalized);
  }

  return Array.from(set);
}

// ============================================================================
// Sync Role Checks (for use with already-loaded member data)
// ============================================================================

/**
 * Check if a member object has a specific role.
 */
export function hasRole(member: MemberData | null, role: MemberRole): boolean {
  if (!member) return false;
  const roles = normalizeRolesArray(member.roles);
  return roles.includes(role);
}

/**
 * Check if member is admin-like (captain OR admin)
 */
export function isAdminLike(member: MemberData | null): boolean {
  if (!member) return false;
  const roles = normalizeRolesArray(member.roles);
  return roles.includes("captain") || roles.includes("admin");
}

// ============================================================================
// Async Role Checks (fetch from Supabase)
// ============================================================================

/**
 * Get member data by ID
 */
export async function getMemberById(memberId: string): Promise<MemberData | null> {
  try {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("id", memberId)
      .maybeSingle();

    if (error) {
      console.error("[roles] getMemberById error:", error.message);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      name: data.name || "",
      handicap: data.handicap,
      roles: data.role ? [data.role] : ["member"],
    };
  } catch (error) {
    console.error("[roles] getMemberById exception:", error);
    return null;
  }
}

/**
 * Get all members for a society
 */
export async function getMembersBySociety(societyId: string): Promise<MemberData[]> {
  try {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("society_id", societyId);

    if (error) {
      console.error("[roles] getMembersBySociety error:", error.message);
      return [];
    }

    return (data || []).map((m) => ({
      id: m.id,
      name: m.name || "",
      handicap: m.handicap,
      roles: m.role ? [m.role] : ["member"],
    }));
  } catch (error) {
    console.error("[roles] getMembersBySociety exception:", error);
    return [];
  }
}

/**
 * Get current user's active member data
 */
export async function getCurrentMember(): Promise<MemberData | null> {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("[roles] getCurrentMember: No user");
      return null;
    }

    // Get profile to find active member
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("active_member_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.active_member_id) {
      console.error("[roles] getCurrentMember: No active member");
      return null;
    }

    return getMemberById(profile.active_member_id);
  } catch (error) {
    console.error("[roles] getCurrentMember exception:", error);
    return null;
  }
}

/**
 * Get current user's roles
 */
export async function getCurrentUserRoles(): Promise<MemberRole[]> {
  const member = await getCurrentMember();
  if (!member) return ["member"];
  return normalizeRolesArray(member.roles);
}

/**
 * Check if the current user has a specific role
 */
export async function currentUserHasRole(role: MemberRole): Promise<boolean> {
  const roles = await getCurrentUserRoles();
  return roles.includes(role);
}

/**
 * Check if user has any of the specified roles
 */
export async function hasAnyRole(rolesToCheck: MemberRole[]): Promise<boolean> {
  const roles = await getCurrentUserRoles();
  return rolesToCheck.some((role) => roles.includes(role));
}

// ============================================================================
// Permission Checks
// ============================================================================

export async function hasManCoRole(): Promise<boolean> {
  return hasAnyRole(["captain", "treasurer", "secretary", "handicapper", "admin"]);
}

export async function canCreateEvents(): Promise<boolean> {
  return hasAnyRole(["captain", "admin"]);
}

export async function canAssignRoles(): Promise<boolean> {
  return hasAnyRole(["captain", "admin"]);
}

export async function canViewFinance(): Promise<boolean> {
  return hasAnyRole(["treasurer", "captain", "admin"]);
}

export async function canEditVenueInfo(): Promise<boolean> {
  return hasAnyRole(["secretary", "captain", "admin"]);
}

export async function canEditHandicaps(): Promise<boolean> {
  return hasAnyRole(["handicapper", "captain", "admin"]);
}
