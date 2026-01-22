// lib/permissions.ts
import type { MemberLike } from "@/lib/rbac";
import { getPermissionsForMember } from "@/lib/rbac";

export function canAccessFinance(currentMember: MemberLike | null | undefined) {
  return getPermissionsForMember(currentMember).canAccessFinance;
}

export function canManageMembers(currentMember: MemberLike | null | undefined) {
  const p = getPermissionsForMember(currentMember);
  return p.canCreateMembers || p.canEditMembers || p.canDeleteMembers;
}

export function canManageRoles(currentMember: MemberLike | null | undefined) {
  return getPermissionsForMember(currentMember).canManageRoles;
}

export function canManageEventPnl(currentMember: MemberLike | null | undefined) {
  const p = getPermissionsForMember(currentMember);
  return p.canManageEventPayments || p.canManageEventExpenses;
}

export function canResetSociety(currentMember: MemberLike | null | undefined) {
  return getPermissionsForMember(currentMember).canResetSociety;
}
