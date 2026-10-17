// Public event invite: RPCs work for anon key (migrations 089 + 090 + 121).

import { supabase } from "@/lib/supabase";
import { mapPublicRsvpError } from "@/lib/eventInvitePublic";
import {
  EventRsvpError,
  parsePostgresRsvpMessage,
  type PublicRsvpMemberEmailResolve,
} from "@/lib/events/eventRsvpDomain";

export type PublicEventInviteSummary = {
  event_id: string;
  name: string;
  date: string;
  course_name: string;
  society_name: string;
  host_society_id: string;
  participant_society_ids: string[];
  rsvp_deadline_at: string | null;
  rsvp_open: boolean;
  /** Host society join code when set — used for “join in app” deep links from the public invite. */
  host_society_join_code: string | null;
};

function firstRpcRow<T extends Record<string, unknown>>(data: unknown): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return data as T;
}

function normalizeResolveRow(row: {
  status: string;
  member_id?: string | null;
  society_id?: string | null;
  user_id?: string | null;
}): PublicRsvpMemberEmailResolve {
  const s = String(row.status || "").trim();
  if (s !== "not_found" && s !== "unlinked" && s !== "linked" && s !== "ambiguous") {
    throw new Error("Unexpected resolve status from server");
  }
  return {
    status: s,
    memberId: row.member_id ? String(row.member_id) : undefined,
    societyId: row.society_id ? String(row.society_id) : undefined,
    userId: row.user_id ? String(row.user_id) : undefined,
  };
}

export async function fetchPublicEventInviteSummary(
  eventId: string,
): Promise<PublicEventInviteSummary | null> {
  const { data, error } = await supabase.rpc("get_public_event_invite_summary", {
    p_event_id: eventId,
  });
  if (error) {
    console.error("[eventInviteRepo] get_public_event_invite_summary:", error.message);
    return null;
  }
  const row = firstRpcRow<{
    event_id: string;
    name: string;
    date: string;
    course_name: string;
    society_name: string;
    host_society_id: string;
    participant_society_ids: string[] | null;
    rsvp_deadline_at: string | null;
    rsvp_open: boolean;
    host_society_join_code?: string | null;
  }>(data);
  if (!row?.event_id) return null;

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const dl = row.rsvp_deadline_at;
    if (dl) {
      const t = new Date(dl).getTime();
      console.log("[rsvp-qa] public invite summary", {
        eventId,
        rsvp_open: Boolean(row.rsvp_open),
        deadlineIso: dl,
        clientNowIso: new Date().toISOString(),
        msUntilDeadline: t - Date.now(),
      });
    } else {
      console.log("[rsvp-qa] public invite summary", {
        eventId,
        rsvp_open: Boolean(row.rsvp_open),
        deadlineIso: null,
        note: "no deadline — invite stays open",
      });
    }
  }

  const joinCode = row.host_society_join_code;
  return {
    event_id: row.event_id,
    name: row.name ?? "",
    date: row.date ?? "",
    course_name: row.course_name ?? "",
    society_name: row.society_name ?? "",
    host_society_id: row.host_society_id,
    participant_society_ids: Array.isArray(row.participant_society_ids)
      ? row.participant_society_ids
      : [],
    rsvp_deadline_at: row.rsvp_deadline_at ?? null,
    rsvp_open: Boolean(row.rsvp_open),
    host_society_join_code:
      joinCode != null && String(joinCode).trim() !== "" ? String(joinCode).trim() : null,
  };
}

export async function submitPublicGuestRsvp(eventId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc("submit_public_event_rsvp_guest", {
    p_event_id: eventId,
    p_name: name.trim(),
  });
  if (error) throw new Error(mapPublicRsvpError(error.message || ""));
}

/**
 * Read-only: how an email maps to a roster row for this event’s participating societies.
 * Safe for anon — performs no writes.
 */
export async function resolvePublicMemberRsvpEmailStatus(
  eventId: string,
  email: string,
): Promise<PublicRsvpMemberEmailResolve> {
  const { data, error } = await supabase.rpc("resolve_public_event_rsvp_member_email_status", {
    p_event_id: eventId,
    p_email: email.trim(),
  });
  if (error) {
    throw new Error(mapPublicRsvpError(error.message || ""));
  }
  const row = firstRpcRow<{
    status: string;
    member_id?: string | null;
    society_id?: string | null;
    user_id?: string | null;
  }>(data);
  if (!row?.status) {
    throw new Error("Could not look up member for this event.");
  }
  return normalizeResolveRow(row);
}

/**
 * Authenticated-only member RSVP by email + event context. Server requires `members.user_id = auth.uid()`.
 * Prefer `setMyStatus` when the app already knows `memberId` / `societyId`.
 */
export async function submitPublicMemberRsvpByEmail(
  eventId: string,
  email: string,
  status: "in" | "out",
): Promise<void> {
  const { error } = await supabase.rpc("submit_public_event_rsvp_member_by_email", {
    p_event_id: eventId,
    p_email: email.trim(),
    p_status: status,
  });
  if (error) {
    const code = parsePostgresRsvpMessage(error.message || "");
    throw new EventRsvpError(code, error.message || undefined);
  }
}

/**
 * Logged-in user: find their member row in any society participating in this event.
 */
export async function findMemberContextForEventInvite(
  userId: string,
  participantSocietyIds: string[],
  hostSocietyId: string,
): Promise<{ memberId: string; societyId: string } | null> {
  const ids = [...new Set(participantSocietyIds.filter(Boolean))];
  if (ids.length === 0) return null;
  const { data, error } = await supabase
    .from("members")
    .select("id, society_id")
    .eq("user_id", userId)
    .in("society_id", ids);
  if (error || !data?.length) return null;
  const ordered = [...ids].sort((a, b) => {
    if (a === hostSocietyId) return -1;
    if (b === hostSocietyId) return 1;
    return 0;
  });
  for (const sid of ordered) {
    const rows = data.filter((m) => m.society_id === sid);
    if (rows.length === 0) continue;
    rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const pick = rows[0];
    return { memberId: String(pick.id), societyId: String(pick.society_id) };
  }
  return null;
}
