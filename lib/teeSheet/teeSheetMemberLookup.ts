import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import { dedupeJointMembers } from "@/lib/jointPersonDedupe";

/**
 * Map any member id (including non-representative dual-society duplicates) → MemberDoc.
 * Prefers rows that carry gender/handicap when multiple society rows exist for one person.
 */
export function buildMemberByPlayerIdMap(
  members: MemberDoc[],
  societyIdToName?: Map<string, string>,
): Map<string, MemberDoc> {
  const map = new Map<string, MemberDoc>();
  for (const m of members) {
    const id = String(m.id ?? "").trim();
    if (!id) continue;
    map.set(id, m);
  }

  if (!societyIdToName || societyIdToName.size === 0 || members.length < 2) {
    return map;
  }

  const deduped = dedupeJointMembers(members, societyIdToName);
  for (const cluster of deduped) {
    const withGender = cluster.mergedMemberIds
      .map((id) => map.get(id))
      .find((m) => m?.gender === "male" || m?.gender === "female");
    const rep = withGender ?? cluster.representative;
    for (const mid of cluster.mergedMemberIds) {
      const existing = map.get(mid);
      if (!existing || (rep.gender && !existing.gender)) {
        map.set(mid, rep);
      }
    }
  }

  return map;
}

export function memberDocForPlayerId(
  playerId: string,
  members: MemberDoc[],
  lookup?: Map<string, MemberDoc>,
  societyIdToName?: Map<string, string>,
): MemberDoc | undefined {
  const map = lookup ?? buildMemberByPlayerIdMap(members, societyIdToName);
  return map.get(String(playerId));
}
