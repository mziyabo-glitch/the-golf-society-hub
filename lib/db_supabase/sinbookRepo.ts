// lib/db_supabase/sinbookRepo.ts
// Sinbook — Rivalry / Side-Bet Tracker
// Uses singleton supabase client. Per-user (auth.uid()), not per-society.

import { supabase } from "@/lib/supabase";

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
};

// ============================================================================
// Sinbooks CRUD
// ============================================================================

/**
 * Get all sinbooks the current user participates in (accepted or creator)
 */
export async function getMySinbooks(): Promise<SinbookWithParticipants[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get sinbook IDs where user is a participant
  const { data: participations, error: pErr } = await supabase
    .from("sinbook_participants")
    .select("sinbook_id")
    .eq("user_id", user.id)
    .in("status", ["accepted", "pending"]);

  if (pErr) throw new Error(pErr.message);
  if (!participations || participations.length === 0) return [];

  const ids = [...new Set(participations.map((p) => p.sinbook_id))];

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

  return (sinbooks ?? []).map((s) => ({
    ...s,
    participants: participantMap.get(s.id) ?? [],
  }));
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

  return (sinbooks ?? []).map((s) => ({
    ...s,
    participants: participantMap.get(s.id) ?? [],
  }));
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

  return { ...data, participants: participants ?? [] };
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

  // Add creator as accepted participant
  const { error: pErr } = await supabase
    .from("sinbook_participants")
    .insert({
      sinbook_id: data.id,
      user_id: user.id,
      display_name: input.creatorDisplayName,
      status: "accepted",
      joined_at: new Date().toISOString(),
    });

  if (pErr) console.error("[sinbookRepo] Failed to add creator as participant:", pErr.message);

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
 * Delete a sinbook (creator only)
 */
export async function deleteSinbook(sinbookId: string): Promise<void> {
  const { error } = await supabase
    .from("sinbooks")
    .delete()
    .eq("id", sinbookId);

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
    .eq("id", entryId);

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
    .eq("id", entryId);

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
