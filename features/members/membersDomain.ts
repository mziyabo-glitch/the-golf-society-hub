import type { MemberDoc } from "@/lib/db_supabase/memberRepo";

export const ROLE_PRIORITY: Record<string, number> = {
  captain: 1,
  treasurer: 2,
  secretary: 3,
  handicapper: 4,
  member: 5,
};

export function getRolePriority(member: MemberDoc): number {
  const role = member.role?.toLowerCase() || "member";
  return ROLE_PRIORITY[role] ?? 99;
}

export function sortMembersByRoleThenName(members: MemberDoc[]): MemberDoc[] {
  return [...members].sort((a, b) => {
    const priorityA = getRolePriority(a);
    const priorityB = getRolePriority(b);
    if (priorityA !== priorityB) return priorityA - priorityB;
    const nameA = (a.displayName || a.name || a.display_name || "").toLowerCase();
    const nameB = (b.displayName || b.name || b.display_name || "").toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

export function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) return pts.toString();
  return pts.toFixed(2).replace(/\.?0+$/, "");
}

export function getRoleBadgesFromMember(member: MemberDoc): string[] {
  const roles = member.roles || [];
  const badges: string[] = [];
  if (roles.some((r) => r.toLowerCase() === "captain")) badges.push("Captain");
  if (roles.some((r) => r.toLowerCase() === "treasurer")) badges.push("Treasurer");
  if (roles.some((r) => r.toLowerCase() === "secretary")) badges.push("Secretary");
  if (roles.some((r) => r.toLowerCase() === "handicapper")) badges.push("Handicapper");
  return badges;
}
