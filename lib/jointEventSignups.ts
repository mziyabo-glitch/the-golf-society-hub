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

/** Same rule as eventRegistrationRepo.isTeeSheetEligible (kept here to avoid RN import in tests). */
export function isJointRegistrationTeeSheetEligible(r: EventRegistration): boolean {
  return isOperationalRegistration(r) && r.status === "in" && r.paid === true;
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

export type JointAttendeeKind = "member" | "guest";

/** One society-scoped registration source (member row or guest row). */
export type JointAttendeeSource = {
  societyId: string;
  societyName: string;
  kind: JointAttendeeKind;
  paid: boolean;
};

/** Merged joint-event attendee row for cross-society visibility UIs. */
export type JointEventAttendeeRow = {
  key: string;
  displayName: string;
  sources: JointAttendeeSource[];
  /** e.g. "M4 Member", "ZGS Guest", "Dual / registered via M4" */
  sourceLabel: string;
  /** e.g. "Paid", "Unpaid", "Paid via M4 / Unpaid via ZGS" */
  paymentLabel: string;
  /** Participating society label: "M4", "ZGS", or "Dual" (members only). */
  societyBadge: string;
  registrations: EventRegistration[];
  guestId?: string;
};

export type JointEventGuestInput = {
  id: string;
  society_id: string;
  name: string;
  paid: boolean;
};

function societyNameFromMap(societyId: string, societyIdToName: Map<string, string>): string {
  return societyIdToName.get(societyId) ?? societyId;
}

function sourcesFromMergedSignup(
  row: MergedJointSignup,
  societyIdToName: Map<string, string>,
): JointAttendeeSource[] {
  return row.registrations.map((r) => ({
    societyId: String(r.society_id),
    societyName: societyNameFromMap(String(r.society_id), societyIdToName),
    kind: "member" as const,
    paid: r.paid === true,
  }));
}

/**
 * Society + member/guest label for a merged attendee row.
 * Dual members: "Dual / registered via {representative society}".
 */
export function formatJointAttendeeSourceLabel(
  sources: JointAttendeeSource[],
  opts?: { representativeSocietyId?: string | null },
): string {
  if (sources.length === 0) return "";

  const memberSources = sources.filter((s) => s.kind === "member");
  if (memberSources.length >= 2) {
    const repId = opts?.representativeSocietyId ?? memberSources[0].societyId;
    const repName =
      memberSources.find((s) => s.societyId === repId)?.societyName ?? memberSources[0].societyName;
    return `Dual / registered via ${repName}`;
  }

  const s = sources[0];
  return `${s.societyName} ${s.kind === "guest" ? "Guest" : "Member"}`;
}

/**
 * Payment label tied to each society registration source.
 * Single status when uniform; per-society when mixed.
 */
export function formatJointAttendeePaymentLabel(sources: JointAttendeeSource[]): string {
  if (sources.length === 0) return "";
  const allPaid = sources.every((s) => s.paid);
  const allUnpaid = sources.every((s) => !s.paid);
  if (allPaid) return "Paid";
  if (allUnpaid) return "Unpaid";
  return sources
    .map((s) => `${s.paid ? "Paid" : "Unpaid"} via ${s.societyName}`)
    .join(" / ");
}

function representativeSocietyIdFromMergedSignup(row: MergedJointSignup): string | null {
  const identities = row.registrations.map((r) =>
    signupIdentityFromRegistration(r as JointEventRegistrationRow),
  );
  if (identities.length === 0) return null;
  return pickRepresentativeIdentity(identities).societyId;
}

function attendeeRowFromMergedSignup(
  row: MergedJointSignup,
  societyIdToName: Map<string, string>,
): JointEventAttendeeRow {
  const sources = sourcesFromMergedSignup(row, societyIdToName);
  const repSocietyId = representativeSocietyIdFromMergedSignup(row);
  return {
    key: row.key,
    displayName: row.displayName,
    sources,
    sourceLabel: formatJointAttendeeSourceLabel(sources, {
      representativeSocietyId: repSocietyId,
    }),
    paymentLabel: formatJointAttendeePaymentLabel(sources),
    societyBadge: row.societyBadge,
    registrations: row.registrations,
  };
}

function attendeeRowFromGuest(
  guest: JointEventGuestInput,
  societyIdToName: Map<string, string>,
): JointEventAttendeeRow {
  const sources: JointAttendeeSource[] = [
    {
      societyId: String(guest.society_id),
      societyName: societyNameFromMap(String(guest.society_id), societyIdToName),
      kind: "guest",
      paid: guest.paid === true,
    },
  ];
  return {
    key: `guest:${guest.id}`,
    displayName: String(guest.name ?? "").trim() || "Guest",
    sources,
    sourceLabel: formatJointAttendeeSourceLabel(sources),
    paymentLabel: formatJointAttendeePaymentLabel(sources),
    societyBadge: sources[0].societyName,
    registrations: [],
    guestId: guest.id,
  };
}

function signupIdentityFromAttendeeRow(row: JointEventAttendeeRow): SignupIdentity {
  if (row.registrations.length > 0) {
    const rep = row.registrations[0] as JointEventRegistrationRow;
    return signupIdentityFromRegistration(rep);
  }
  const src = row.sources[0];
  return {
    memberId: row.guestId ? `guest:${row.guestId}` : row.key,
    societyId: src?.societyId ?? "",
    user_id: null,
    email: null,
    name: row.displayName,
  };
}

function mergeAttendeeRows(
  primary: JointEventAttendeeRow,
  secondary: JointEventAttendeeRow,
): JointEventAttendeeRow {
  const sources = [...primary.sources, ...secondary.sources];
  const repSocietyId =
    primary.registrations.length > 0
      ? representativeSocietyIdFromMergedSignup({
          key: primary.key,
          displayName: primary.displayName,
          societyBadge: primary.societyBadge,
          societyIds: primary.sources.map((s) => s.societyId),
          mergedMemberIds: primary.registrations.map((r) => String(r.member_id)),
          representativeMemberId: String(primary.registrations[0]?.member_id ?? ""),
          registrations: primary.registrations,
        })
      : (primary.sources[0]?.societyId ?? secondary.sources[0]?.societyId ?? null);

  const societyIds = [...new Set(sources.map((s) => s.societyId).filter(Boolean))];
  const societyBadge =
    societyIds.length >= 2
      ? "Dual"
      : jointSocietySourceBadge(societyIds, new Map(sources.map((s) => [s.societyId, s.societyName])));

  return {
    key: primary.key,
    displayName: primary.displayName,
    sources,
    sourceLabel: formatJointAttendeeSourceLabel(sources, {
      representativeSocietyId: repSocietyId,
    }),
    paymentLabel: formatJointAttendeePaymentLabel(sources),
    societyBadge,
    registrations: primary.registrations,
    guestId: secondary.guestId ?? primary.guestId,
  };
}

/** Merge guest rows that share user_id, email, or normalized name (e.g. duplicate guest signups). */
function dedupeGuestAttendeeRows(guestRows: JointEventAttendeeRow[]): JointEventAttendeeRow[] {
  if (guestRows.length <= 1) return guestRows;

  const identities = guestRows.map(signupIdentityFromAttendeeRow);
  const clusters = clusterSignupIdentities(identities);
  const out: JointEventAttendeeRow[] = [];

  for (const cluster of clusters) {
    const clusterIds = new Set(cluster.map((c) => c.memberId));
    const rows = guestRows.filter((r) => clusterIds.has(signupIdentityFromAttendeeRow(r).memberId));
    if (rows.length === 0) continue;
    let merged = rows[0];
    for (let i = 1; i < rows.length; i++) {
      merged = mergeAttendeeRows(merged, rows[i]);
    }
    out.push(merged);
  }

  return out;
}

function mergeGuestsIntoMemberRows(
  memberRows: JointEventAttendeeRow[],
  guestRows: JointEventAttendeeRow[],
): { memberRows: JointEventAttendeeRow[]; orphanGuests: JointEventAttendeeRow[] } {
  const usedGuestKeys = new Set<string>();
  const mergedMembers = memberRows.map((member) => {
    const memberIdentity = signupIdentityFromAttendeeRow(member);
    const match = guestRows.find((guest) => {
      if (usedGuestKeys.has(guest.key)) return false;
      return shouldMergeSignupIdentities(memberIdentity, signupIdentityFromAttendeeRow(guest));
    });
    if (!match) return member;
    usedGuestKeys.add(match.key);
    return mergeAttendeeRows(member, match);
  });

  const orphanGuests = guestRows.filter((g) => !usedGuestKeys.has(g.key));
  return { memberRows: mergedMembers, orphanGuests };
}

/**
 * Merge member registrations + guest rows into one attendee list per person (members de-duped).
 * Input should already be scoped to participating societies for joint events.
 */
export function resolveJointEventAttendees(
  regs: JointEventRegistrationRow[] | EventRegistration[],
  guests: JointEventGuestInput[],
  societyIdToName: Map<string, string>,
  membersById?: Map<string, MemberDoc>,
  opts?: { attendingMembersOnly?: boolean },
): JointEventAttendeeRow[] {
  const attendingOnly = opts?.attendingMembersOnly !== false;
  let memberRegs = regs as JointEventRegistrationRow[];
  if (attendingOnly) {
    memberRegs = memberRegs.filter((r) => r.status === "in");
  }

  const merged = mergeJointEventSignups(memberRegs, societyIdToName, membersById);
  const memberRows = merged.map((row) => attendeeRowFromMergedSignup(row, societyIdToName));
  const guestRows = guests.map((g) => attendeeRowFromGuest(g, societyIdToName));

  const { memberRows: withGuestsMerged, orphanGuests } = mergeGuestsIntoMemberRows(
    memberRows,
    guestRows,
  );
  const dedupedGuests = dedupeGuestAttendeeRows(orphanGuests);

  return [...withGuestsMerged, ...dedupedGuests].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

/** Summary counts from merged joint attendee rows (one per person + guests). */
export function summarizeJointEventAttendees(rows: JointEventAttendeeRow[]) {
  return {
    attendeeCount: rows.length,
    memberCount: rows.filter((r) => !r.guestId).length,
    guestCount: rows.filter((r) => !!r.guestId).length,
    paidCount: rows.filter((r) => r.sources.every((s) => s.paid)).length,
    unpaidCount: rows.filter((r) => r.sources.some((s) => !s.paid)).length,
  };
}
