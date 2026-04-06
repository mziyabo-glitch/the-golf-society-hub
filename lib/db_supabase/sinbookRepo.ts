// lib/db_supabase/sinbookRepo.ts
// Sinbook — Rivalries (head-to-head challenge tracker; not a betting product)
// Uses singleton supabase client. Per-user (auth.uid()), not per-society.

import { supabase } from "@/lib/supabase";
import {
  resolvePersonDisplayName,
  type RivalryPersonNameHints,
  memberDocToRivalryHints,
} from "@/lib/rivalryPersonName";
import { getMembersByUserIdsInSocieties, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { getMySocieties } from "@/lib/db_supabase/mySocietiesRepo";

// ============================================================================
// Types
// ============================================================================

export type SinbookStatus = "pending" | "accepted" | "declined";

export type Sinbook = {
  id: string;
  title: string;
  description: string | null;
  stake: string | null;
  season: string | null;
  is_private: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  join_code: string | null;
};

export type SinbookParticipant = {
  id: string;
  sinbook_id: string;
  user_id: string;
  display_name: string;
  status: SinbookStatus;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
};

export type SinbookEntry = {
  id: string;
  sinbook_id: string;
  added_by: string;
  description: string;
  winner_id: string | null;
  entry_date: string;
  created_at: string;
  updated_at: string;
};

export type SinbookNotification = {
  id: string;
  user_id: string;
  sinbook_id: string;
  type: "invite" | "accepted" | "entry_added" | "entry_edited" | "entry_deleted";
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

export type SinbookWithParticipants = Sinbook & {
  participants: SinbookParticipant[];
  /** Runtime hints from `hydrateSinbooksParticipantDisplayHints` (not a DB column). */
  rivalryNameHintsByUserId?: Record<string, RivalryPersonNameHints>;
};

function pickRicherMember(a: MemberDoc | undefined, b: MemberDoc): MemberDoc {
  if (!a) return b;
  const score = (m: MemberDoc) => {
    const n = (m.name ?? "").trim().length;
    const d = (m.display_name ?? "").trim().length;
    const e = (m.email ?? "").trim().length ? 1 : 0;
    return n * 4 + d * 2 + e;
  };
  return score(b) > score(a) ? b : a;
}

type RpcDisplayContextRow = {
  sinbook_id: string;
  user_id: string;
  participant_display_name: string | null;
  profile_full_name: string | null;
  profile_email: string | null;
  auth_meta_full_name: string | null;
  auth_meta_name: string | null;
};

/**
 * Loads profile + auth metadata (via RPC) and co-member rows to resolve rivalry display names.
 * Mutates each sinbook in place.
 */
export async function hydrateSinbooksParticipantDisplayHints(
  sinbooks: SinbookWithParticipants[],
): Promise<void> {
  if (sinbooks.length === 0) return;

  const ids = [...new Set(sinbooks.map((s) => s.id).filter(Boolean))];
  const allUserIds = [...new Set(sinbooks.flatMap((s) => s.participants.map((p) => p.user_id)))];

  const societies = await getMySocieties();
  const societyIds = [...new Set(societies.map((s) => s.societyId).filter(Boolean))];

  let rpcRows: RpcDisplayContextRow[] = [];
  try {
    const { data, error } = await supabase.rpc("get_sinbook_participant_display_context_batch", {
      p_sinbook_ids: ids,
    });
    if (error) {
      console.warn("[sinbookRepo] get_sinbook_participant_display_context_batch:", error.message);
    } else {
      rpcRows = (data ?? []) as RpcDisplayContextRow[];
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[sinbookRepo] display context RPC failed:", msg);
  }

  const rpcMap = new Map<string, RpcDisplayContextRow>();
  for (const row of rpcRows) {
    rpcMap.set(`${row.sinbook_id}:${row.user_id}`, row);
  }

  const memberByUserId = new Map<string, MemberDoc>();
  if (allUserIds.length > 0 && societyIds.length > 0) {
    const mems = await getMembersByUserIdsInSocieties(allUserIds, societyIds);
    for (const m of mems) {
      const uid = m.user_id;
      if (!uid) continue;
      memberByUserId.set(uid, pickRicherMember(memberByUserId.get(uid), m));
    }
  }

  for (const sb of sinbooks) {
    const hints: Record<string, RivalryPersonNameHints> = {};
    for (const p of sb.participants) {
      const rpcRow = rpcMap.get(`${sb.id}:${p.user_id}`);
      const mem = memberByUserId.get(p.user_id);
      const memHints = mem ? memberDocToRivalryHints(mem) : {};

      const merged: RivalryPersonNameHints = {
        ...memHints,
        participantDisplayName: p.display_name,
        profileDisplayName: rpcRow?.profile_full_name ?? null,
        profileEmail: rpcRow?.profile_email ?? null,
        authFullName: rpcRow?.auth_meta_full_name ?? null,
        authName: rpcRow?.auth_meta_name ?? null,
        userId: p.user_id,
        memberId: mem?.id ?? null,
        personId: mem?.person_id ?? null,
        email: rpcRow?.profile_email ?? mem?.email ?? null,
      };

      hints[p.user_id] = merged;

      if (__DEV__) {
        const resolved = resolvePersonDisplayName(merged);
        console.log("[rivalry-names] map", {
          sinbook_id: sb.id,
          user_id: merged.userId ?? null,
          member_id: merged.memberId ?? null,
          person_id: merged.personId ?? null,
          email: merged.email ?? null,
          resolvedName: resolved.name,
          source: resolved.source,
          usedOpponentFallback: resolved.usedOpponentFallback,
        });
      }
    }
    sb.rivalryNameHintsByUserId = hints;
  }
}

/** Creator or accepted participant may remove the entire rivalry (matches RLS). */
export function canDeleteSinbookAsUser(sb: SinbookWithParticipants, userId: string | undefined): boolean {
  if (!userId) return false;
  if (sb.created_by === userId) return true;
  return sb.participants.some((p) => p.user_id === userId && p.status === "accepted");
}

// ============================================================================
// Sinbooks CRUD
// ============================================================================

/**
 * Get all sinbooks the current user participates in (accepted or creator)
 */
export async function getMySinbooks(): Promise<SinbookWithParticipants[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Sinbook IDs where user is a participant (accepted or pending)
  const { data: participations, error: pErr } = await supabase
    .from("sinbook_participants")
    .select("sinbook_id")
    .eq("user_id", user.id)
    .in("status", ["accepted", "pending"]);

  if (pErr) throw new Error(pErr.message);

  const fromParticipants = [...new Set((participations ?? []).map((p) => p.sinbook_id))];

  // Sinbooks created by user but missing a participant row (recovery / legacy)
  const { data: createdRows, error: cErr } = await supabase
    .from("sinbooks")
    .select("id")
    .eq("created_by", user.id);

  if (cErr) throw new Error(cErr.message);
  const fromCreator = (createdRows ?? []).map((r) => r.id).filter(Boolean);
  const ids = [...new Set([...fromParticipants, ...fromCreator])];

  if (ids.length === 0) return [];

  const { data: sinbooks, error: sErr } = await supabase
    .from("sinbooks")
    .select("*")
    .in("id", ids)
    .order("updated_at", { ascending: false });

  if (sErr) throw new Error(sErr.message);

  // Fetch all participants for these sinbooks
  const { data: allParticipants, error: apErr } = await supabase
    .from("sinbook_participants")
    .select("*")
    .in("sinbook_id", ids);

  if (apErr) throw new Error(apErr.message);

  const participantMap = new Map<string, SinbookParticipant[]>();
  for (const p of allParticipants ?? []) {
    const arr = participantMap.get(p.sinbook_id) ?? [];
    arr.push(p);
    participantMap.set(p.sinbook_id, arr);
  }

  const out = (sinbooks ?? []).map((s) => ({
    ...s,
    participants: participantMap.get(s.id) ?? [],
  }));
  await hydrateSinbooksParticipantDisplayHints(out);
  return out;
}

/**
 * Get pending invites for current user
 */
export async function getMyPendingInvites(): Promise<SinbookWithParticipants[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: pending, error: pErr } = await supabase
    .from("sinbook_participants")
    .select("sinbook_id")
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (pErr) throw new Error(pErr.message);
  if (!pending || pending.length === 0) return [];

  const ids = pending.map((p) => p.sinbook_id);

  const { data: sinbooks, error: sErr } = await supabase
    .from("sinbooks")
    .select("*")
    .in("id", ids);

  if (sErr) throw new Error(sErr.message);

  const { data: allParticipants, error: apErr } = await supabase
    .from("sinbook_participants")
    .select("*")
    .in("sinbook_id", ids);

  if (apErr) throw new Error(apErr.message);

  const participantMap = new Map<string, SinbookParticipant[]>();
  for (const p of allParticipants ?? []) {
    const arr = participantMap.get(p.sinbook_id) ?? [];
    arr.push(p);
    participantMap.set(p.sinbook_id, arr);
  }

  const out = (sinbooks ?? []).map((s) => ({
    ...s,
    participants: participantMap.get(s.id) ?? [],
  }));
  await hydrateSinbooksParticipantDisplayHints(out);
  return out;
}

/**
 * Get a single sinbook with its participants
 */
export async function getSinbook(sinbookId: string): Promise<SinbookWithParticipants | null> {
  const { data, error } = await supabase
    .from("sinbooks")
    .select("*")
    .eq("id", sinbookId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: participants, error: pErr } = await supabase
    .from("sinbook_participants")
    .select("*")
    .eq("sinbook_id", sinbookId);

  if (pErr) throw new Error(pErr.message);

  const out: SinbookWithParticipants = { ...data, participants: participants ?? [] };
  await hydrateSinbooksParticipantDisplayHints([out]);
  return out;
}

/**
 * Create a new sinbook and add creator as accepted participant
 */
export async function createSinbook(input: {
  title: string;
  description?: string;
  stake?: string;
  season?: string;
  is_private?: boolean;
  creatorDisplayName: string;
}): Promise<Sinbook> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("sinbooks")
    .insert({
      title: input.title,
      description: input.description ?? null,
      stake: input.stake ?? null,
      season: input.season ?? null,
      is_private: input.is_private ?? false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Add creator as accepted participant (required for shared RLS paths; fail closed if insert fails)
  const { error: pErr } = await supabase
    .from("sinbook_participants")
    .insert({
      sinbook_id: data.id,
      user_id: user.id,
      display_name: input.creatorDisplayName,
      status: "accepted",
      joined_at: new Date().toISOString(),
    });

  if (pErr) {
    await supabase.from("sinbooks").delete().eq("id", data.id);
    throw new Error(
      pErr.message ||
        "Could not set you up as a participant in this rivalry. Nothing was saved — try again.",
    );
  }

  return data;
}

/**
 * Update sinbook metadata
 */
export async function updateSinbook(
  sinbookId: string,
  updates: Partial<Pick<Sinbook, "title" | "description" | "stake" | "season" | "is_private">>
): Promise<void> {
  const { error } = await supabase
    .from("sinbooks")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", sinbookId);

  if (error) throw new Error(error.message);
}

/**
 * Delete a sinbook and all related data (creator only).
 * Explicitly removes children before deleting the parent row.
 */
export async function deleteSinbook(sinbookId: string): Promise<void> {
  // 1) Delete notifications (RLS: only current user's rows; CASCADE handles the rest)
  const { error: nErr } = await supabase
    .from("sinbook_notifications")
    .delete()
    .eq("sinbook_id", sinbookId);
  if (nErr) console.error("[sinbookRepo] notification cleanup:", nErr.message);

  // 2) Delete entries
  const { error: eErr } = await supabase
    .from("sinbook_entries")
    .delete()
    .eq("sinbook_id", sinbookId);
  if (eErr) throw new Error(eErr.message);

  // 3) Delete participants
  const { error: pErr } = await supabase
    .from("sinbook_participants")
    .delete()
    .eq("sinbook_id", sinbookId);
  if (pErr) throw new Error(pErr.message);

  // 4) Delete sinbook itself
  const { error } = await supabase
    .from("sinbooks")
    .delete()
    .eq("id", sinbookId);
  if (error) throw new Error(error.message);
}

/**
 * Reset a sinbook — clears all entries but keeps the sinbook,
 * participants, stake, and settings intact.
 */
export async function resetSinbook(sinbookId: string): Promise<void> {
  const { error } = await supabase
    .from("sinbook_entries")
    .delete()
    .eq("sinbook_id", sinbookId);

  if (error) throw new Error(error.message);
}

// ============================================================================
// Participants
// ============================================================================

/**
 * Invite a user by their user_id (adds pending participant + notification)
 */
export async function inviteParticipant(
  sinbookId: string,
  targetUserId: string,
  targetDisplayName: string,
  sinbookTitle: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("sinbook_participants")
    .insert({
      sinbook_id: sinbookId,
      user_id: targetUserId,
      display_name: targetDisplayName,
      status: "pending",
      invited_by: user.id,
    });

  if (error) throw new Error(error.message);

  // Create notification for the invited user
  await createNotification(targetUserId, sinbookId, "invite",
    "New rivalry invite",
    `You've been invited to "${sinbookTitle}"`
  );
}

/**
 * Accept an invite
 */
export async function acceptInvite(sinbookId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("sinbook_participants")
    .update({ status: "accepted", joined_at: new Date().toISOString() })
    .eq("sinbook_id", sinbookId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  // Notify the other participant(s)
  const { data: sinbook } = await supabase
    .from("sinbooks")
    .select("title, created_by")
    .eq("id", sinbookId)
    .single();

  if (sinbook) {
    const { data: participants } = await supabase
      .from("sinbook_participants")
      .select("user_id")
      .eq("sinbook_id", sinbookId)
      .neq("user_id", user.id);

    for (const p of participants ?? []) {
      await createNotification(p.user_id, sinbookId, "accepted",
        "Invite accepted",
        `Your rival joined "${sinbook.title}"`
      );
    }
  }
}

/**
 * Decline an invite
 */
export async function declineInvite(sinbookId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("sinbook_participants")
    .update({ status: "declined" })
    .eq("sinbook_id", sinbookId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

/**
 * Accept invite by sinbook ID (for deep link flow — auto-add user as participant)
 */
export async function acceptInviteByLink(
  sinbookId: string,
  displayName: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check if already a participant
  const { data: existing } = await supabase
    .from("sinbook_participants")
    .select("id, status")
    .eq("sinbook_id", sinbookId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.status === "pending") {
      await acceptInvite(sinbookId);
    }
    // Already accepted or declined — no-op
    return;
  }

  // Not a participant yet — add and accept
  const { error } = await supabase
    .from("sinbook_participants")
    .insert({
      sinbook_id: sinbookId,
      user_id: user.id,
      display_name: displayName,
      status: "accepted",
      joined_at: new Date().toISOString(),
    });

  if (error) throw new Error(error.message);

  // Notify others
  const { data: sinbook } = await supabase
    .from("sinbooks")
    .select("title")
    .eq("id", sinbookId)
    .single();

  if (sinbook) {
    const { data: others } = await supabase
      .from("sinbook_participants")
      .select("user_id")
      .eq("sinbook_id", sinbookId)
      .neq("user_id", user.id);

    for (const p of others ?? []) {
      await createNotification(p.user_id, sinbookId, "accepted",
        "New rival joined",
        `Someone joined "${sinbook.title}"`
      );
    }
  }
}

// ============================================================================
// Join Code
// ============================================================================

/**
 * Preview info returned when looking up a sinbook by its short join code.
 */
export type JoinCodePreview = {
  id: string;
  title: string;
  stake: string | null;
  created_by: string;
};

/**
 * Look up a sinbook by its 6-character join code.
 * Uses a SECURITY DEFINER function so RLS doesn't block the lookup.
 * Returns null if no match found.
 */
export async function getSinbookByJoinCode(code: string): Promise<JoinCodePreview | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized.length < 4) return null;

  const { data, error } = await supabase
    .rpc("lookup_sinbook_by_join_code", { _code: normalized });

  if (error) {
    console.error("[sinbookRepo] lookup_sinbook_by_join_code error:", error.message);
    return null;
  }

  if (!data || (Array.isArray(data) && data.length === 0)) return null;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    id: row.id,
    title: row.title,
    stake: row.stake ?? null,
    created_by: row.created_by,
  };
}

/**
 * Join a rivalry using the short 6-character join code.
 * Looks up the sinbook, then adds the current user as a participant.
 */
export async function joinByCode(
  code: string,
  displayName: string,
): Promise<{ sinbookId: string; title: string }> {
  const FRIENDLY_ERROR = "Invite code not ready yet. Please try again in a moment.";
  try {
    const preview = await getSinbookByJoinCode(code);
    if (!preview) {
      throw new Error(FRIENDLY_ERROR);
    }
    await acceptInviteByLink(preview.id, displayName);
    return { sinbookId: preview.id, title: preview.title };
  } catch (err) {
    if (err instanceof Error && err.message !== FRIENDLY_ERROR) {
      throw new Error(FRIENDLY_ERROR);
    }
    throw err;
  }
}

/**
 * Get win counts per participant for a set of sinbooks.
 * Returns Map<sinbook_id, Map<user_id, wins>>
 */
export async function getWinCountsForSinbooks(
  sinbookIds: string[]
): Promise<Map<string, Map<string, number>>> {
  if (sinbookIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("sinbook_entries")
    .select("sinbook_id, winner_id")
    .in("sinbook_id", sinbookIds)
    .not("winner_id", "is", null);

  if (error) {
    console.error("[sinbookRepo] getWinCountsForSinbooks failed:", error.message);
    return new Map();
  }

  const result = new Map<string, Map<string, number>>();
  for (const row of data ?? []) {
    if (!row.winner_id) continue;
    let sbMap = result.get(row.sinbook_id);
    if (!sbMap) {
      sbMap = new Map();
      result.set(row.sinbook_id, sbMap);
    }
    sbMap.set(row.winner_id, (sbMap.get(row.winner_id) ?? 0) + 1);
  }
  return result;
}

// ============================================================================
// Entries
// ============================================================================

/**
 * Get entries for a sinbook, ordered by date desc
 */
export async function getEntries(sinbookId: string): Promise<SinbookEntry[]> {
  const { data, error } = await supabase
    .from("sinbook_entries")
    .select("*")
    .eq("sinbook_id", sinbookId)
    .order("entry_date", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Add an entry
 */
export async function addEntry(
  sinbookId: string,
  input: { description: string; winner_id?: string; entry_date?: string },
  sinbookTitle: string,
): Promise<SinbookEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("sinbook_entries")
    .insert({
      sinbook_id: sinbookId,
      added_by: user.id,
      description: input.description,
      winner_id: input.winner_id ?? null,
      entry_date: input.entry_date ?? new Date().toISOString().split("T")[0],
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Notify other participants
  const { data: others } = await supabase
    .from("sinbook_participants")
    .select("user_id")
    .eq("sinbook_id", sinbookId)
    .eq("status", "accepted")
    .neq("user_id", user.id);

  for (const p of others ?? []) {
    await createNotification(p.user_id, sinbookId, "entry_added",
      "New entry added",
      `New entry in "${sinbookTitle}": ${input.description}`
    );
  }

  return data;
}

/**
 * Update an entry
 */
export async function updateEntry(
  entryId: string,
  sinbookId: string,
  updates: Partial<Pick<SinbookEntry, "description" | "winner_id" | "entry_date">>,
  sinbookTitle: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("sinbook_entries")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("sinbook_id", sinbookId);

  if (error) throw new Error(error.message);

  const { data: others } = await supabase
    .from("sinbook_participants")
    .select("user_id")
    .eq("sinbook_id", sinbookId)
    .eq("status", "accepted")
    .neq("user_id", user.id);

  for (const p of others ?? []) {
    await createNotification(p.user_id, sinbookId, "entry_edited",
      "Entry updated",
      `An entry was edited in "${sinbookTitle}"`
    );
  }
}

/**
 * Delete an entry
 */
export async function deleteEntry(
  entryId: string,
  sinbookId: string,
  sinbookTitle: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("sinbook_entries")
    .delete()
    .eq("id", entryId)
    .eq("sinbook_id", sinbookId);

  if (error) throw new Error(error.message);

  const { data: others } = await supabase
    .from("sinbook_participants")
    .select("user_id")
    .eq("sinbook_id", sinbookId)
    .eq("status", "accepted")
    .neq("user_id", user.id);

  for (const p of others ?? []) {
    await createNotification(p.user_id, sinbookId, "entry_deleted",
      "Entry removed",
      `An entry was removed from "${sinbookTitle}"`
    );
  }
}

// ============================================================================
// Notifications
// ============================================================================

async function createNotification(
  userId: string,
  sinbookId: string,
  type: SinbookNotification["type"],
  title: string,
  body: string,
): Promise<void> {
  const { error } = await supabase
    .from("sinbook_notifications")
    .insert({ user_id: userId, sinbook_id: sinbookId, type, title, body });

  if (error) console.error("[sinbookRepo] notification insert failed:", error.message);
}

/**
 * Get notifications for current user
 */
export async function getMyNotifications(): Promise<SinbookNotification[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("sinbook_notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Get unread notification count
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("sinbook_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("sinbook_notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) console.error("[sinbookRepo] markAllRead failed:", error.message);
}

/**
 * Count user's active sinbooks (for entitlement gate)
 */
export async function countMySinbooks(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("sinbook_participants")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "accepted");

  if (error) return 0;
  return count ?? 0;
}
