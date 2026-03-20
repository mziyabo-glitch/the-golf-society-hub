/**
 * Resolve display names for event registrations / attendee lists.
 */

import type { MemberDoc } from "@/lib/db_supabase/memberRepo";

export type AttendeeNameSource =
  | "member"
  | "combined"
  | "profile"
  | "snapshot"
  | "email"
  | "fallback";

export type ResolveAttendeeNameOptions = {
  registrationId?: string;
  memberId?: string;
  /** If event_registrations (or similar) ever stores a snapshot name */
  snapshotName?: string | null;
};

type MemberWithNames = MemberDoc & {
  first_name?: string | null;
  last_name?: string | null;
};

/**
 * Priority:
 * 1. members.name (full name)
 * 2. first_name + last_name
 * 3. display_name / displayName (profile)
 * 4. registration snapshot name (if provided)
 * 5. email (last resort before generic fallback)
 * 6. "Member"
 */
export function resolveAttendeeDisplayName(
  member: MemberDoc | null | undefined,
  opts: ResolveAttendeeNameOptions = {},
): { name: string; source: AttendeeNameSource } {
  const { registrationId, memberId, snapshotName } = opts;
  const snap = snapshotName?.trim();

  const log = (resolvedName: string, source: AttendeeNameSource) => {
    if (!__DEV__) return;
    console.log("[event-attendees] name resolution", {
      registrationId: registrationId ?? null,
      memberId: member?.id ?? memberId ?? null,
      resolvedName,
      source,
    });
  };

  const m = member as MemberWithNames | null | undefined;

  if (m) {
    const primary = m.name?.trim();
    if (primary) {
      log(primary, "member");
      return { name: primary, source: "member" };
    }

    const combined = [m.first_name, m.last_name]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .join(" ")
      .trim();
    if (combined) {
      log(combined, "combined");
      return { name: combined, source: "combined" };
    }

    const profile = m.display_name?.trim() || m.displayName?.trim();
    if (profile) {
      log(profile, "profile");
      return { name: profile, source: "profile" };
    }
  }

  if (snap) {
    log(snap, "snapshot");
    return { name: snap, source: "snapshot" };
  }

  if (m?.email?.trim()) {
    log(m.email.trim(), "email");
    return { name: m.email.trim(), source: "email" };
  }

  log("Member", "fallback");
  return { name: "Member", source: "fallback" };
}
