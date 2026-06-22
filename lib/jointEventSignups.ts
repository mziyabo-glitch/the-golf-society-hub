/**
 * Joint events: merge society-scoped signups into one attendee row per real person.
 *
 * De-dupe priority: user_id → email → normalized full name (fallback).
 * Society badges: single society name (e.g. M4 / ZGS) or "Dual".
 * Payment / confirmed state stays on each society-scoped registration row.
 */

import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { resolveAttendeeDisplayName } from "@/lib/eventAttendeeName";
import { canonicalJointPersonKey } from "@/lib/jointPersonDedupe";

function isOperationalRegistration(r: EventRegistration): boolean {
  return r.removed_from_event_at == null || String(r.removed_from_event_at).trim() === "";
}

export type JointEventRegistrationRow = EventRegistration & {
  user_id?: string | null;
  member_email?: string | null;
  member_name?: string | null;
  member_display_name?: string | null;
};

export type MergedJointSignup = {
  key: string;
  displayName: string;
  /** Participating society label: "M4", "ZGS", or "Dual". */
  societyBadge: string;
  societyIds: string[];
  mergedMemberIds: string[];
  representativeMemberId: string;
  registrations: EventRegistration[];
};

function normalizeEmail(email: string | null | undefined): string {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return "";
  return e;
}

function normalizeName(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type SignupIdentity = {
  memberId: string;
  societyId: string;
  user_id?: string | null;
  email?: string | null;
  name?: string | null;
};

export function signupIdentityFromRegistration(
  reg: JointEventRegistrationRow,
  member?: MemberDoc | null,
): SignupIdentity {
  return {
    memberId: String(reg.member_id),
    societyId: String(reg.society_id),
    user_id: member?.user_id ?? reg.user_id ?? null,
    email: member?.email ?? reg.member_email ?? null,
    name:
      member?.displayName ??
      member?.display_name ??
      member?.name ??
      reg.member_display_name ??
      reg.member_name ??
      null,
  };
}

/** Merge when identities share user_id, email, or normalized full name (fallback). */
export function shouldMergeSignupIdentities(a: SignupIdentity, b: SignupIdentity): boolean {
  const uidA = a.user_id?.trim();
  const uidB = b.user_id?.trim();
  if (uidA && uidB && uidA === uidB) return true;

  const emA = normalizeEmail(a.email);
  const emB = normalizeEmail(b.email);
  if (emA && emB && emA === emB) return true;

  const nameA = normalizeName(a.name);
  const nameB = normalizeName(b.name);
  if (nameA.length >= 3 && nameA === nameB) return true;

  return false;
}

function clusterSignupIdentities(identities: SignupIdentity[]): SignupIdentity[][] {
  const n = identities.length;
  if (n === 0) return [];

  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }
  function union(i: number, j: number) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[rj] = ri;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (shouldMergeSignupIdentities(identities[i], identities[j])) union(i, j);
    }
  }

  const buckets = new Map<number, SignupIdentity[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r)!.push(identities[i]);
  }
  return [...buckets.values()];
}

export function jointSocietySourceBadge(
  societyIds: string[],
  societyIdToName: Map<string, string>,
): string {
  const unique = [...new Set(societyIds.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (unique.length >= 2) return "Dual";
  if (unique.length === 1) {
    return societyIdToName.get(unique[0]) ?? unique[0];
  }
  return "";
}

function memberStubFromIdentity(id: SignupIdentity): MemberDoc {
  return {
    id: id.memberId,
    society_id: id.societyId,
    user_id: id.user_id ?? null,
    email: id.email ?? undefined,
    name: id.name ?? undefined,
    display_name: id.name ?? undefined,
    displayName: id.name ?? undefined,
  };
}

function pickRepresentativeIdentity(cluster: SignupIdentity[]): SignupIdentity {
  const withUser = cluster.filter((c) => c.user_id?.trim());
  if (withUser.length > 0) {
    withUser.sort((a, b) => a.memberId.localeCompare(b.memberId));
    return withUser[0];
  }
  const sorted = [...cluster].sort((a, b) => a.memberId.localeCompare(b.memberId));
  return sorted[0];
}

/**
 * Merge joint event signups (all participating societies) into one row per person.
 * Input registrations should already be scoped to participating societies.
 */
export function mergeJointEventSignups(
  regs: JointEventRegistrationRow[] | EventRegistration[],
  societyIdToName: Map<string, string>,
  membersById?: Map<string, MemberDoc>,
): MergedJointSignup[] {
  const operational = (regs as JointEventRegistrationRow[]).filter(isOperationalRegistration);
  if (operational.length === 0) return [];

  const identities = operational.map((r) =>
    signupIdentityFromRegistration(r, membersById?.get(String(r.member_id))),
  );
  const clusters = clusterSignupIdentities(identities);
  const out: MergedJointSignup[] = [];

  for (const cluster of clusters) {
    const rep = pickRepresentativeIdentity(cluster);
    const repMember = memberStubFromIdentity(rep);
    const key = canonicalJointPersonKey(repMember);
    const mergedMemberIds = [...new Set(cluster.map((c) => c.memberId))].sort((a, b) =>
      a.localeCompare(b),
    );
    const societyIds = [...new Set(cluster.map((c) => c.societyId).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    const clusterRegs = operational.filter((r) => mergedMemberIds.includes(String(r.member_id)));
    const displayName = resolveAttendeeDisplayName(repMember, {
      memberId: rep.memberId,
    }).name;

    out.push({
      key,
      displayName,
      societyBadge: jointSocietySourceBadge(societyIds, societyIdToName),
      societyIds,
      mergedMemberIds,
      representativeMemberId: rep.memberId,
      registrations: clusterRegs,
    });
  }

  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return out;
}

/** Registration for a person in the active society (payment actions). */
export function registrationForActiveSocietyInMergedSignup(
  row: MergedJointSignup,
  activeSocietyId: string,
): EventRegistration | null {
  const sid = String(activeSocietyId);
  return row.registrations.find((r) => String(r.society_id) === sid) ?? null;
}

/**
 * De-dupe member ids for joint tee-sheet candidate pool (one id per real person).
 * Preserves first-seen order from `memberIds`.
 */
export function dedupeJointSignupMemberIds(
  memberIds: string[],
  members: MemberDoc[],
  societyIdToName: Map<string, string>,
): string[] {
  if (memberIds.length === 0) return [];

  const memberById = new Map(members.map((m) => [String(m.id), m]));
  const regsAsStubs: SignupIdentity[] = memberIds.map((id) => {
    const m = memberById.get(String(id));
    return {
      memberId: String(id),
      societyId: String(m?.society_id ?? ""),
      user_id: m?.user_id ?? null,
      email: m?.email ?? null,
      name: m?.displayName ?? m?.display_name ?? m?.name ?? null,
    };
  });

  const clusters = clusterSignupIdentities(regsAsStubs);
  const repByMemberId = new Map<string, string>();
  for (const cluster of clusters) {
    const rep = pickRepresentativeIdentity(cluster).memberId;
    for (const c of cluster) {
      repByMemberId.set(c.memberId, rep);
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of memberIds) {
    const rep = repByMemberId.get(String(id)) ?? String(id);
    if (seen.has(rep)) continue;
    seen.add(rep);
    out.push(rep);
  }
  return out;
}

/** True when any society-scoped registration in the cluster is tee-sheet eligible. */
export function mergedSignupIsTeeSheetEligible(
  row: MergedJointSignup,
  isEligible: (r: EventRegistration) => boolean,
): boolean {
  return row.registrations.some(isEligible);
}
