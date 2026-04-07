/**
 * Society-scoped RSVP stats for captain dashboards (joint-safe when inputs are pre-filtered).
 */

import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";

/** Normalize guest display names for loose duplicate detection (not a unique key). */
export function normalizeRsvpGuestNameForDedupe(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Members on the active society roster with **no** `event_registrations` row for this society
 * and event. Registrations must already be filtered to `society_id === activeSocietyId` and
 * members limited to that society's roster (so joint events do not mix societies).
 */
export function countMembersWithNoSocietyRsvpRow(
  societyMembers: { id: string }[],
  societyScopedRegs: Pick<EventRegistration, "member_id">[],
): number {
  const regIds = new Set(societyScopedRegs.map((r) => String(r.member_id)));
  return societyMembers.reduce((acc, m) => acc + (regIds.has(String(m.id)) ? 0 : 1), 0);
}

/**
 * How many guest rows exceed unique normalized names (0 = all names distinct under normalization).
 */
export function countExtraGuestRowsBeyondUniqueNames(guests: { name: string }[]): number {
  if (guests.length === 0) return 0;
  const keys = new Set(guests.map((g) => normalizeRsvpGuestNameForDedupe(g.name)));
  return Math.max(0, guests.length - keys.size);
}
