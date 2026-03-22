import type { MemberDoc } from "@/lib/db_supabase/memberRepo";

/**
 * Identity keys for "same person in two participant societies" — visual badge only.
 *
 * **Never uses display names** — similar names cannot produce a false-positive dual badge.
 *
 * **user_id** alone is insufficient: captain-added rows often have `user_id` NULL until claimed,
 * or legacy data may not link the same auth user across societies. We also use **normalized email**
 * and **person_id** when present so ManCo sees dual membership when the data model splits identity.
 *
 * Email matching: **trim + ASCII lowercase** on the full string (`normalizeMemberEmail`). Not
 * Unicode domain normalization (rare); shared family inboxes still correctly match as one identity.
 */
export type DualMemberResolution = {
  /** user_id appears in member rows in ≥2 participant societies */
  dualUserIds: Set<string>;
  /** Normalized email appears in ≥2 participant societies (non-empty on each row) */
  dualEmails: Set<string>;
  /** person_id appears in ≥2 participant societies */
  dualPersonIds: Set<string>;
};

export function createEmptyDualMemberResolution(): DualMemberResolution {
  return {
    dualUserIds: new Set(),
    dualEmails: new Set(),
    dualPersonIds: new Set(),
  };
}

/** Trim edges + `toLowerCase()` for stable cross-row comparison (case-insensitive). */
export function normalizeMemberEmail(e?: string | null): string | null {
  const t = (e ?? "").trim().toLowerCase();
  return t.length > 0 ? t : null;
}

function normalizePersonId(p?: string | null): string | null {
  const t = typeof p === "string" ? p.trim() : "";
  return t.length > 0 ? t : null;
}

/**
 * Build which identities qualify as "dual" (present in ≥2 distinct participant societies).
 */
export function computeDualMemberResolution(
  participantSocietyIds: string[],
  membersLists: MemberDoc[][],
): DualMemberResolution {
  const byUser = new Map<string, Set<string>>();
  const byEmail = new Map<string, Set<string>>();
  const byPerson = new Map<string, Set<string>>();

  for (let i = 0; i < participantSocietyIds.length; i++) {
    const sid = participantSocietyIds[i];
    const members = membersLists[i] ?? [];
    for (const m of members) {
      const uid = m.user_id;
      if (typeof uid === "string" && uid.length > 0) {
        let set = byUser.get(uid);
        if (!set) {
          set = new Set();
          byUser.set(uid, set);
        }
        set.add(sid);
      }
      const em = normalizeMemberEmail(m.email);
      if (em) {
        let es = byEmail.get(em);
        if (!es) {
          es = new Set();
          byEmail.set(em, es);
        }
        es.add(sid);
      }
      const pid = normalizePersonId(m.person_id);
      if (pid) {
        let ps = byPerson.get(pid);
        if (!ps) {
          ps = new Set();
          byPerson.set(pid, ps);
        }
        ps.add(sid);
      }
    }
  }

  const dualUserIds = new Set<string>();
  for (const [uid, sids] of byUser) {
    if (sids.size >= 2) dualUserIds.add(uid);
  }
  const dualEmails = new Set<string>();
  for (const [em, sids] of byEmail) {
    if (sids.size >= 2) dualEmails.add(em);
  }
  const dualPersonIds = new Set<string>();
  for (const [pid, sids] of byPerson) {
    if (sids.size >= 2) dualPersonIds.add(pid);
  }

  return { dualUserIds, dualEmails, dualPersonIds };
}

/** @deprecated use computeDualMemberResolution — kept for tests/callers expecting user_id only */
export function computeDualMemberUserIds(
  participantSocietyIds: string[],
  membersLists: MemberDoc[][],
): Set<string> {
  return computeDualMemberResolution(participantSocietyIds, membersLists).dualUserIds;
}

/** Compact label for two societies, e.g. "M4 + ZGS" when names allow. */
function shortSocietyLabel(name: string): string {
  const t = name.trim();
  if (!t) return "";
  const paren = t.match(/\(([A-Za-z0-9]{2,6})\)/);
  if (paren) return paren[1].toUpperCase();
  const first = t.split(/[\s/·|]+/)[0] ?? t;
  if (first.length <= 6 && /^[A-Za-z0-9]+$/i.test(first)) return first.toUpperCase();
  return first.slice(0, 4).toUpperCase();
}

export function dualParticipationPairSubtitle(
  societies: { society_id: string; society_name?: string | null }[],
): string | null {
  const uniq = [...new Map(societies.map((s) => [s.society_id, s])).values()].filter((s) => s.society_id);
  if (uniq.length !== 2) return null;
  const a = shortSocietyLabel(String(uniq[0].society_name ?? ""));
  const b = shortSocietyLabel(String(uniq[1].society_name ?? ""));
  if (!a || !b || a === b) return null;
  return `${a} + ${b}`;
}

export function memberIsDualInJointEvent(
  member: MemberDoc | undefined,
  resolution: DualMemberResolution,
): boolean {
  if (!member) return false;
  const uid = member.user_id;
  if (typeof uid === "string" && uid.length > 0 && resolution.dualUserIds.has(uid)) {
    return true;
  }
  const em = normalizeMemberEmail(member.email);
  if (em && resolution.dualEmails.has(em)) {
    return true;
  }
  const pid = normalizePersonId(member.person_id);
  if (pid && resolution.dualPersonIds.has(pid)) {
    return true;
  }
  return false;
}
