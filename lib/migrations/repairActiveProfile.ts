import { getMember, getMembersBySocietyId, type MemberDoc } from "@/lib/db/memberRepo";
import { getUserDoc, setActiveSocietyAndMember } from "@/lib/db/userRepo";

function isCaptainLike(member: MemberDoc): boolean {
  const roles = member.roles ?? [];
  return roles.some((r) => {
    const v = String(r).toLowerCase();
    return v === "captain" || v === "admin";
  });
}

function isTreasurer(member: MemberDoc): boolean {
  const roles = member.roles ?? [];
  return roles.some((r) => String(r).toLowerCase() === "treasurer");
}

function chooseBestDefaultMember(members: MemberDoc[]): MemberDoc | null {
  if (members.length === 0) return null;
  const captain = members.find(isCaptainLike);
  if (captain) return captain;
  const treasurer = members.find(isTreasurer);
  if (treasurer) return treasurer;
  return members[0];
}

/**
 * Ensures the signed-in user's activeMemberId is a REAL member doc id for the active society.
 *
 * This fixes a common legacy migration issue where AsyncStorage "session.currentUserId" (often the auth uid)
 * was mistakenly copied into users/{uid}.activeMemberId, causing:
 * - finance/event manager access to fail
 * - member deletion to be blocked
 * - settings/reset society to be blocked
 */
export async function repairActiveProfile(uid: string): Promise<void> {
  const user = await getUserDoc(uid);
  if (!user?.activeSocietyId) return;

  const societyId = user.activeSocietyId;
  const currentId = user.activeMemberId;

  // If activeMemberId exists but doesn't resolve to a member in this society, it's invalid.
  if (currentId) {
    const member = await getMember(currentId);
    if (member && member.societyId === societyId) {
      return; // already valid
    }
  }

  // Pick a safe default: Captain/Admin -> Treasurer -> first member.
  const members = await getMembersBySocietyId(societyId);
  const picked = chooseBestDefaultMember(members);
  if (picked) {
    await setActiveSocietyAndMember(uid, societyId, picked.id);
  }
}
