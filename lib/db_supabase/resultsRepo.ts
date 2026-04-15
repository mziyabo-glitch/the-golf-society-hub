// lib/db_supabase/resultsRepo.ts
import { supabase } from "@/lib/supabase";
import { canonicalJointPersonKey, dedupeJointMembers } from "@/lib/jointPersonDedupe";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";

/** One row per member_id; if duplicates exist (legacy / bad data), keep latest by updated_at. */
export function dedupeEventResultsByMemberIdPreferLatest<T extends { member_id: string; updated_at?: string }>(
  rows: T[],
): T[] {
  const byMember = new Map<string, T>();
  for (const r of rows) {
    const mid = String(r.member_id);
    const prev = byMember.get(mid);
    if (!prev) {
      byMember.set(mid, r);
      continue;
    }
    const tNew = r.updated_at ? new Date(r.updated_at).getTime() : 0;
    const tOld = prev.updated_at ? new Date(prev.updated_at).getTime() : 0;
    if (tNew >= tOld) byMember.set(mid, r);
  }
  return [...byMember.values()];
}

/** Guest rows: one per (society_id, event_guest_id); keep latest by updated_at. */
export function dedupeEventResultsBySocietyGuestPreferLatest<
  T extends { society_id: string; event_guest_id: string; updated_at?: string },
>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const r of rows) {
    const key = `${r.society_id}:${r.event_guest_id}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }
    const tNew = r.updated_at ? new Date(r.updated_at).getTime() : 0;
    const tOld = prev.updated_at ? new Date(prev.updated_at).getTime() : 0;
    if (tNew >= tOld) byKey.set(key, r);
  }
  return [...byKey.values()];
}

/** Member rows (deduped per member) plus guest rows (deduped per society + guest). */
export function dedupeEventResultsPreferLatest(rows: EventResultDoc[]): EventResultDoc[] {
  const memberRows = rows.filter(
    (r): r is EventResultDoc & { member_id: string } =>
      r.member_id != null && String(r.member_id).length > 0,
  );
  const guestRows = rows.filter(
    (r): r is EventResultDoc & { event_guest_id: string } =>
      r.event_guest_id != null && String(r.event_guest_id).length > 0,
  );
  return [
    ...dedupeEventResultsByMemberIdPreferLatest(memberRows),
    ...dedupeEventResultsBySocietyGuestPreferLatest(guestRows),
  ];
}

/**
 * Matrix / OOM log: one visible row per real person per event in a society view.
 * Merges duplicate `event_results` that share the same joint person key (e.g. dual member ids
 * incorrectly both scoped to one society, or legacy duplicate rows).
 */
function dedupeEventResultRowsByJointPersonKey<
  T extends {
    member_id: string;
    updated_at?: string;
    points?: number;
    day_value?: number | null;
    position?: number | null;
  },
>(rows: T[], membersById: Map<string, MemberDoc>): T[] {
  const byKey = new Map<string, T>();
  for (const r of rows) {
    const m = membersById.get(r.member_id);
    const stub: MemberDoc = m ?? { id: r.member_id, society_id: "" };
    const k = canonicalJointPersonKey(stub);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, r);
      continue;
    }
    const tNew = r.updated_at ? new Date(r.updated_at).getTime() : 0;
    const tOld = prev.updated_at ? new Date(prev.updated_at).getTime() : 0;
    if (tNew > tOld) {
      byKey.set(k, r);
    } else if (tNew === tOld && String(r.member_id).localeCompare(String(prev.member_id)) < 0) {
      byKey.set(k, r);
    }
  }
  return [...byKey.values()];
}

function logOomMatrixDebugDev(params: {
  societyId: string;
  eventId: string;
  eventName: string;
  rawRows: { member_id: string; id?: string; points?: number; day_value?: number | null; position?: number | null }[];
  afterMemberDedupe: typeof params.rawRows;
  finalRows: typeof params.rawRows;
  membersById: Map<string, MemberDoc>;
}): void {
  if (!__DEV__) return;
  const { societyId, eventId, eventName, rawRows, afterMemberDedupe, finalRows, membersById } = params;

  const personKey = (mid: string) => {
    const m = membersById.get(mid);
    const stub: MemberDoc = m ?? { id: mid, society_id: "" };
    return canonicalJointPersonKey(stub);
  };

  const keyCount = new Map<string, number>();
  for (const r of rawRows) {
    const k = personKey(r.member_id);
    keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
  }
  const duplicatePersonKeys = [...keyCount.entries()].filter(([, n]) => n > 1).map(([k, n]) => ({ key: k, count: n }));

  const nameCount = new Map<string, string[]>();
  for (const r of rawRows) {
    const m = membersById.get(r.member_id);
    const label = (m?.name || m?.displayName || "").trim() || r.member_id;
    if (!nameCount.has(label)) nameCount.set(label, []);
    nameCount.get(label)!.push(r.member_id);
  }
  const duplicateVisibleNames = [...nameCount.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, memberIds]) => ({ name, memberIds: [...new Set(memberIds)] }));

  const merged =
    rawRows.length > afterMemberDedupe.length || afterMemberDedupe.length > finalRows.length;

  if (merged || duplicatePersonKeys.length > 0 || duplicateVisibleNames.length > 0) {
    console.warn("[oom-matrix-debug]", {
      eventId,
      societyId,
      eventName,
      rawFetchedCount: rawRows.length,
      afterMemberIdDedupeCount: afterMemberDedupe.length,
      finalRenderedCount: finalRows.length,
      rawFetchedRows: rawRows.map((r) => ({
        id: r.id,
        member_id: r.member_id,
        points: r.points,
        day_value: r.day_value,
        position: r.position,
        personKey: personKey(r.member_id),
      })),
      duplicatePersonKeys,
      duplicateVisibleNames,
      finalRows: finalRows.map((r) => ({
        id: r.id,
        member_id: r.member_id,
        points: r.points,
        day_value: r.day_value,
        position: r.position,
      })),
    });
  }
}

function dedupeUpsertInputsLastWins(results: EventResultInput[], societyId: string): EventResultInput[] {
  const byMember = new Map<string, EventResultInput>();
  const byGuest = new Map<string, EventResultInput>();
  for (const r of results) {
    if (r.event_guest_id) {
      const k = `${societyId}:${r.event_guest_id}`;
      byGuest.set(k, r);
    } else if (r.member_id) {
      byMember.set(String(r.member_id), r);
    }
  }
  return [...byMember.values(), ...byGuest.values()];
}

/** OOM must only include real member rows; guest `event_results` (member_id null) are excluded — no OOM points for guests. */
function filterRowsWithKnownMembers<T extends { member_id: string | null }>(
  rows: T[],
  membersMap: Map<string, MemberDoc>,
): T[] {
  return rows.filter(
    (r) => r.member_id != null && String(r.member_id).length > 0 && membersMap.has(String(r.member_id)),
  );
}

/**
 * Dev-only: same (event, society) scope but multiple result rows map to one real person (joint dual ids).
 * Set EXPO_PUBLIC_OOM_DEBUG_EVENT_ID to always log full detail for that event id.
 */
function logOomDuplicatePlayerRowsDev(params: {
  societyId: string;
  eventId: string;
  rows: {
    id: string;
    member_id: string;
    points: number;
    day_value?: number | null;
    position?: number | null;
  }[];
  membersById: Map<string, MemberDoc>;
}): void {
  if (!__DEV__) return;
  const debugEvent = process.env.EXPO_PUBLIC_OOM_DEBUG_EVENT_ID?.trim();
  const byKey = new Map<string, typeof params.rows>();
  for (const r of params.rows) {
    const m = params.membersById.get(r.member_id);
    const stub: MemberDoc = m ?? { id: r.member_id, society_id: "" };
    const k = canonicalJointPersonKey(stub);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }
  for (const [, group] of byKey) {
    if (group.length <= 1) continue;
    const firstName =
      params.membersById.get(group[0].member_id)?.name ||
      params.membersById.get(group[0].member_id)?.displayName ||
      "Unknown";
    const payload = group.map((r) => {
      const m = params.membersById.get(r.member_id);
      return {
        memberId: r.member_id,
        playerName: m?.name || m?.displayName || firstName,
        resultRowId: r.id,
        score: r.day_value ?? null,
        position: r.position ?? null,
        points: r.points,
      };
    });
    console.warn("[oom-debug] duplicate player rows", {
      eventId: params.eventId,
      societyId: params.societyId,
      playerName: firstName,
      resultRowIds: group.map((r) => r.id),
      rows: payload,
    });
  }
  if (debugEvent && debugEvent === params.eventId) {
    console.log("[oom-debug] event results snapshot (EXPO_PUBLIC_OOM_DEBUG_EVENT_ID)", {
      eventId: params.eventId,
      societyId: params.societyId,
      rowCount: params.rows.length,
      rows: params.rows.map((r) => ({
        id: r.id,
        memberId: r.member_id,
        name: params.membersById.get(r.member_id)?.name ?? "?",
        points: r.points,
        position: r.position,
        day_value: r.day_value,
      })),
    });
  }
}

export type EventResultDoc = {
  id: string;
  society_id: string;
  event_id: string;
  member_id: string | null;
  event_guest_id: string | null;
  points: number; // OOM points (can be decimal for tie averaging, e.g., 16.5)
  day_value?: number | null; // Raw score: stableford pts or net score
  front_9_value?: number | null; // Front 9 score for splitter category payouts
  back_9_value?: number | null; // Back 9 score for splitter category payouts
  birdie_count?: number | null; // Birdie count for splitter category payouts
  position?: number | null; // Finishing position (1, 2, 3...)
  created_at: string;
  updated_at: string;
};

/** Exactly one of member_id or event_guest_id must be set (DB XOR). Society comes from upsertEventResults. */
export type EventResultInput = {
  member_id?: string | null;
  event_guest_id?: string | null;
  points: number; // OOM points (can be decimal for tie averaging)
  day_value?: number; // Raw score for audit trail
  front_9_value?: number | null;
  back_9_value?: number | null;
  birdie_count?: number | null;
  position?: number; // Finishing position for audit trail
};

export type OrderOfMeritEntry = {
  memberId: string;
  memberName: string;
  totalPoints: number;
  eventsPlayed: number;
  rank: number;
};

/** One row per society member for PDF / full-field OOM standings. */
export type OomFullFieldStandingRow = {
  memberId: string;
  memberName: string;
  eventsPlayed: number;
  totalPoints: number;
  rank: number;
  /** True when total OOM points > 0 (meaningful season points). */
  hasOomPoints: boolean;
};

export type OomLeaderPodiumSlot = {
  rank: number;
  name: string;
  points: number;
};

/**
 * Full society OOM table + podium: every member gets a rank; zeros follow point-earners.
 * Person-key aggregation matches {@link getOrderOfMeritTotals}; ties on points match app rules.
 */
export async function getOrderOfMeritFullFieldExport(
  societyId: string,
): Promise<{
  oomEventCount: number;
  leadersTop3: OomLeaderPodiumSlot[];
  standings: OomFullFieldStandingRow[];
}> {
  if (!societyId) {
    throw new Error("Missing societyId");
  }

  const { getMembersBySocietyId } = await import("@/lib/db_supabase/memberRepo");

  const [resultsRes, members] = await Promise.all([
    supabase.from("event_results").select("event_id, member_id, points").eq("society_id", societyId),
    getMembersBySocietyId(societyId),
  ]);

  const { data: resultsData, error: resultsError } = resultsRes;
  if (resultsError) {
    console.error("[resultsRepo] getOrderOfMeritFullFieldExport results failed:", resultsError);
    if (resultsError.code === "42P01") {
      const alpha = members
        .map((m, i) => ({
          memberId: m.id,
          memberName: (m.displayName || m.name || "Unknown").trim(),
          eventsPlayed: 0,
          totalPoints: 0,
          rank: i + 1,
          hasOomPoints: false,
        }))
        .sort((a, b) => a.memberName.localeCompare(b.memberName));
      alpha.forEach((r, i) => {
        r.rank = i + 1;
      });
      return { oomEventCount: 0, leadersTop3: [], standings: alpha };
    }
    throw new Error(resultsError.message || "Failed to load results");
  }

  const rows = Array.isArray(resultsData) ? resultsData : [];
  const eventIdSet = [...new Set(rows.map((r: any) => r.event_id))];

  let eventsData: any[] | null = null;
  if (eventIdSet.length > 0) {
    const ev = await supabase.from("events").select("id, classification, is_oom").in("id", eventIdSet);
    if (ev.error) {
      console.error("[resultsRepo] getOrderOfMeritFullFieldExport events failed:", ev.error);
      throw new Error(ev.error.message || "Failed to load events");
    }
    eventsData = ev.data ?? [];
  }

  const eventsMap = new Map((eventsData ?? []).map((e: any) => [e.id, e]));
  const oomEventIds = new Set(
    (eventsData ?? [])
      .filter(
        (e: any) =>
          e.is_oom === true ||
          (e.classification && String(e.classification).toLowerCase() === "oom"),
      )
      .map((e: any) => e.id),
  );

  const oomEventCount = oomEventIds.size;

  const memberIdsFromResults = [
    ...new Set(rows.map((r: any) => r.member_id).filter(Boolean).map((id: string) => String(id))),
  ];
  let membersData: any[] | null = null;
  if (memberIdsFromResults.length > 0) {
    const mem = await supabase
      .from("members")
      .select("id, name, display_name, user_id, email, society_id")
      .in("id", memberIdsFromResults);
    if (mem.error) {
      console.error("[resultsRepo] getOrderOfMeritFullFieldExport result members failed:", mem.error);
      throw new Error(mem.error.message || "Failed to load members");
    }
    membersData = mem.data ?? [];
  }

  const membersMap = new Map<string, MemberDoc>(
    (membersData ?? []).map((m: any) => [
      m.id,
      {
        id: m.id,
        society_id: m.society_id ?? "",
        user_id: m.user_id ?? null,
        name: m.name,
        display_name: m.display_name,
        displayName: m.name || m.display_name,
        email: m.email,
      } as MemberDoc,
    ]),
  );

  const oomRows = filterRowsWithKnownMembers(rows, membersMap);

  type PersonAgg = { totalPoints: number; eventIds: Set<string>; memberIds: Set<string> };
  const byPersonKey: Record<string, PersonAgg> = {};

  oomRows.forEach((row: any) => {
    if (!oomEventIds.has(row.event_id)) return;
    if (!eventsMap.get(row.event_id)) return;

    const memberId = String(row.member_id);
    const member = membersMap.get(memberId);
    const stub: MemberDoc = member ?? { id: memberId, society_id: societyId };
    const personKey = canonicalJointPersonKey(stub);
    const points = Number(row.points) || 0;

    if (!byPersonKey[personKey]) {
      byPersonKey[personKey] = { totalPoints: 0, eventIds: new Set(), memberIds: new Set() };
    }
    byPersonKey[personKey].totalPoints += points;
    byPersonKey[personKey].eventIds.add(row.event_id);
    byPersonKey[personKey].memberIds.add(memberId);
  });

  const emptySocietyLabel = new Map<string, string>();

  type GroupRow = {
    personKey: string;
    totalPoints: number;
    eventsPlayed: number;
    displayName: string;
    memberIds: string[];
  };

  const groups: GroupRow[] = Object.entries(byPersonKey).map(([personKey, agg]) => {
    const memberDocs = [...agg.memberIds]
      .map((id) => membersMap.get(id))
      .filter((m): m is MemberDoc => Boolean(m));
    const deduped =
      memberDocs.length > 0 ? dedupeJointMembers(memberDocs, emptySocietyLabel) : [];
    const rep = deduped[0]?.representative;
    const displayName = rep?.displayName || rep?.display_name || rep?.name || "Unknown";
    return {
      personKey,
      totalPoints: agg.totalPoints,
      eventsPlayed: agg.eventIds.size,
      displayName,
      memberIds: [...agg.memberIds],
    };
  });

  const withPoints = groups
    .filter((g) => g.totalPoints > 0)
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.eventsPlayed !== a.eventsPlayed) return b.eventsPlayed - a.eventsPlayed;
      return a.displayName.localeCompare(b.displayName);
    });

  let currentRank = 1;
  const rankedPositive: Array<GroupRow & { rank: number }> = withPoints.map((g, index) => {
    if (index > 0 && g.totalPoints < withPoints[index - 1].totalPoints) {
      currentRank = index + 1;
    }
    return { ...g, rank: currentRank };
  });

  const zeroGroups = groups
    .filter((g) => g.totalPoints <= 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  let nextRank =
    rankedPositive.length > 0 ? Math.max(...rankedPositive.map((x) => x.rank)) + 1 : 1;
  const rankedZeros: Array<GroupRow & { rank: number }> = zeroGroups.map((g) => {
    const r = nextRank;
    nextRank += 1;
    return { ...g, rank: r };
  });

  const allRanked = [...rankedPositive, ...rankedZeros];
  const keyToStanding = new Map<
    string,
    { rank: number; totalPoints: number; eventsPlayed: number }
  >();
  for (const g of allRanked) {
    keyToStanding.set(g.personKey, {
      rank: g.rank,
      totalPoints: g.totalPoints,
      eventsPlayed: g.eventsPlayed,
    });
  }

  const leadersTop3: OomLeaderPodiumSlot[] = rankedPositive.slice(0, 3).map((g) => ({
    rank: g.rank,
    name: g.displayName,
    points: g.totalPoints,
  }));

  const withStanding: OomFullFieldStandingRow[] = [];
  const orphans: OomFullFieldStandingRow[] = [];

  for (const m of members) {
    const name = (m.displayName || m.name || "Unknown").trim();
    const k = canonicalJointPersonKey(m as MemberDoc);
    const hit = keyToStanding.get(k);
    if (hit) {
      withStanding.push({
        memberId: m.id,
        memberName: name,
        eventsPlayed: hit.eventsPlayed,
        totalPoints: hit.totalPoints,
        rank: hit.rank,
        hasOomPoints: hit.totalPoints > 0,
      });
    } else {
      orphans.push({
        memberId: m.id,
        memberName: name,
        eventsPlayed: 0,
        totalPoints: 0,
        rank: 0,
        hasOomPoints: false,
      });
    }
  }

  orphans.sort((a, b) => a.memberName.localeCompare(b.memberName));
  const maxAssignedRank =
    allRanked.length > 0 ? Math.max(...allRanked.map((x) => x.rank)) : 0;
  const baseRank = maxAssignedRank + 1;
  orphans.forEach((o, i) => {
    o.rank = baseRank + i;
  });

  const standings = [...withStanding, ...orphans].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.memberName.localeCompare(b.memberName);
  });

  if (rankedPositive.length === 0) {
    const alpha = [...standings].sort((a, b) => a.memberName.localeCompare(b.memberName));
    alpha.forEach((r, i) => {
      r.rank = i + 1;
    });
    return { oomEventCount, leadersTop3: [], standings: alpha };
  }

  return { oomEventCount, leadersTop3, standings };
}

/**
 * Upsert event results for an event
 * Creates or updates result rows for the given event and members
 */
export async function upsertEventResults(
  eventId: string,
  societyId: string,
  results: EventResultInput[]
): Promise<void> {
  // Defensive check: ensure results is an array
  if (!Array.isArray(results)) {
    console.error("[resultsRepo] upsertEventResults: results is not an array!", {
      type: typeof results,
      value: results,
    });
    throw new Error("Invalid results: expected an array");
  }

  console.log("[resultsRepo] upsertEventResults:", {
    eventId,
    societyId,
    resultCount: results.length,
  });

  if (!eventId || !societyId) {
    throw new Error("Missing eventId or societyId");
  }

  if (results.length === 0) {
    console.log("[resultsRepo] No results to upsert");
    return;
  }

  for (const r of results) {
    const hasM = r.member_id != null && String(r.member_id).length > 0;
    const hasG = r.event_guest_id != null && String(r.event_guest_id).length > 0;
    if (hasM === hasG) {
      throw new Error("Each result row must set exactly one of member_id or event_guest_id.");
    }
  }

  const dedupedInputs = dedupeUpsertInputsLastWins(results, societyId);
  if (dedupedInputs.length !== results.length) {
    console.warn("[resultsRepo] upsertEventResults: deduped duplicate keys in batch", {
      eventId,
      before: results.length,
      after: dedupedInputs.length,
    });
  }

  const memberRows = dedupedInputs.filter(
    (r) => r.member_id != null && String(r.member_id).length > 0,
  );
  const guestRows = dedupedInputs.filter(
    (r) => r.event_guest_id != null && String(r.event_guest_id).length > 0,
  );

  const mapUpsertError = (error: { message?: string; details?: string; hint?: string; code?: string }) => {
    if (error.code === "PGRST204" || error.message?.includes("PGRST204") || error.message?.includes("schema cache")) {
      throw new Error(
        "Database schema mismatch (PGRST204). The event_results table may be out of date. " +
          "Please run migrations and reload the API schema in Supabase Dashboard → Settings → API → Reload schema.",
      );
    }
    if (error.code === "42501" || error.message?.includes("policy")) {
      throw new Error("Permission denied. Only Captain or Handicapper can save points.");
    }
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      throw new Error("Results table not found. Please run migrations in Supabase.");
    }
    if (error.code === "23503") {
      throw new Error("Invalid event, member, or guest reference. Please refresh and try again.");
    }
    throw new Error(error.message || "Failed to save event results");
  };

  const allReturned: EventResultDoc[] = [];

  if (memberRows.length > 0) {
    const rows = memberRows.map((r) => ({
      event_id: eventId,
      society_id: societyId,
      member_id: r.member_id as string,
      event_guest_id: null,
      points: r.points,
      day_value: r.day_value ?? null,
      front_9_value: r.front_9_value ?? null,
      back_9_value: r.back_9_value ?? null,
      birdie_count: r.birdie_count ?? null,
      position: r.position ?? null,
    }));
    console.log("[resultsRepo] upserting member rows:", rows.length);
    const { data, error } = await supabase
      .from("event_results")
      .upsert(rows, { onConflict: "event_id,member_id", ignoreDuplicates: false })
      .select();
    if (error) {
      console.error("[resultsRepo] upsertEventResults (members) failed:", error);
      mapUpsertError(error);
    }
    if (!data?.length) {
      console.error("[resultsRepo] upsert members returned no data - RLS may be blocking");
      throw new Error("Failed to save points. You may not have permission.");
    }
    allReturned.push(...(data as EventResultDoc[]));
  }

  if (guestRows.length > 0) {
    const rows = guestRows.map((r) => ({
      event_id: eventId,
      society_id: societyId,
      member_id: null,
      event_guest_id: r.event_guest_id as string,
      points: r.points,
      day_value: r.day_value ?? null,
      front_9_value: r.front_9_value ?? null,
      back_9_value: r.back_9_value ?? null,
      birdie_count: r.birdie_count ?? null,
      position: r.position ?? null,
    }));
    console.log("[resultsRepo] upserting guest rows:", rows.length);
    const { data, error } = await supabase
      .from("event_results")
      .upsert(rows, { onConflict: "event_id,society_id,event_guest_id", ignoreDuplicates: false })
      .select();
    if (error) {
      console.error("[resultsRepo] upsertEventResults (guests) failed:", error);
      mapUpsertError(error);
    }
    if (!data?.length) {
      console.error("[resultsRepo] upsert guests returned no data - RLS may be blocking");
      throw new Error("Failed to save guest results. You may not have permission.");
    }
    allReturned.push(...(data as EventResultDoc[]));
  }

  console.log("[resultsRepo] upsertEventResults success, saved", allReturned.length, "rows");
}

/**
 * Get results for a specific event
 */
export async function getEventResults(eventId: string): Promise<EventResultDoc[]> {
  console.log("[resultsRepo] getEventResults:", eventId);

  const { data, error } = await supabase
    .from("event_results")
    .select("*")
    .eq("event_id", eventId);

  if (error) {
    console.error("[resultsRepo] getEventResults failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    // Return empty array if table doesn't exist yet (migration not run)
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      console.warn("[resultsRepo] event_results table does not exist yet - run migration");
      return [];
    }
    throw new Error(error.message || "Failed to get event results");
  }

  const raw = (data ?? []).map((r: any) => ({
    ...r,
    member_id: r.member_id ?? null,
    event_guest_id: r.event_guest_id ?? null,
  })) as EventResultDoc[];
  const out = dedupeEventResultsPreferLatest(raw);
  console.log("[resultsRepo] getEventResults returned:", out.length, "rows");
  return out;
}

/**
 * Results for one event scoped to a society (joint events store one row set per participating society).
 */
export async function getEventResultsForSociety(
  eventId: string,
  societyId: string,
): Promise<EventResultDoc[]> {
  console.log("[resultsRepo] getEventResultsForSociety:", { eventId, societyId });

  if (!eventId || !societyId) {
    throw new Error("Missing eventId or societyId");
  }

  const { data, error } = await supabase
    .from("event_results")
    .select("*")
    .eq("event_id", eventId)
    .eq("society_id", societyId);

  if (error) {
    console.error("[resultsRepo] getEventResultsForSociety failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return [];
    }
    throw new Error(error.message || "Failed to get event results for society");
  }

  const raw = (data ?? []).map((r: any) => ({
    ...r,
    member_id: r.member_id ?? null,
    event_guest_id: r.event_guest_id ?? null,
  })) as EventResultDoc[];
  const out = dedupeEventResultsPreferLatest(raw);
  if (out.length !== (data?.length ?? 0)) {
    console.warn("[resultsRepo] getEventResultsForSociety: removed duplicate rows", {
      eventId,
      societyId,
      before: data?.length ?? 0,
      after: out.length,
    });
  }
  console.log("[resultsRepo] getEventResultsForSociety returned:", out.length, "rows");
  return out;
}

/**
 * Get Order of Merit totals for a society
 * Aggregates points across all OOM events
 */
export async function getOrderOfMeritTotals(
  societyId: string
): Promise<OrderOfMeritEntry[]> {
  console.log("[resultsRepo] getOrderOfMeritTotals:", societyId);

  if (!societyId) {
    throw new Error("Missing societyId");
  }

  // First, get all event results for the society (separate query for reliability)
  const { data: resultsData, error: resultsError } = await supabase
    .from("event_results")
    .select("event_id, member_id, points")
    .eq("society_id", societyId);

  if (resultsError) {
    console.error("[resultsRepo] getOrderOfMeritTotals results query failed:", {
      message: resultsError.message,
      details: resultsError.details,
      hint: resultsError.hint,
      code: resultsError.code,
    });
    // Return empty array if table doesn't exist yet (migration not run)
    if (resultsError.code === "42P01" || resultsError.message?.includes("does not exist")) {
      console.warn("[resultsRepo] event_results table does not exist yet - run migration");
      return [];
    }
    throw new Error(resultsError.message || "Failed to get Order of Merit totals");
  }

  if (!resultsData || resultsData.length === 0) {
    console.log("[resultsRepo] No results found");
    return [];
  }

  // Get unique event IDs and member IDs
  const eventIds = [...new Set(resultsData.map((r) => r.event_id))];
  const memberIds = [...new Set(resultsData.map((r) => r.member_id).filter(Boolean).map((id) => String(id)))];

  // Fetch events to filter OOM only
  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select("id, classification, is_oom")
    .in("id", eventIds);

  if (eventsError) {
    console.error("[resultsRepo] events query failed:", eventsError);
    throw new Error(eventsError.message || "Failed to get events");
  }

  // Fetch members for names + identity fields (canonicalJointPersonKey: user_id, email; no person_id column in DB)
  const { data: membersData, error: membersError } = await supabase
    .from("members")
    .select("id, name, display_name, user_id, email, society_id")
    .in("id", memberIds);

  if (membersError) {
    console.error("[resultsRepo] members query failed:", membersError);
    throw new Error(membersError.message || "Failed to get members");
  }

  // Build lookup maps (MemberDoc-shaped for canonicalJointPersonKey)
  const eventsMap = new Map((eventsData ?? []).map((e) => [e.id, e]));
  const membersMap = new Map<string, MemberDoc>(
    (membersData ?? []).map((m: any) => [
      m.id,
      {
        id: m.id,
        society_id: m.society_id ?? "",
        user_id: m.user_id ?? null,
        name: m.name,
        display_name: m.display_name,
        displayName: m.name || m.display_name,
        email: m.email,
      } as MemberDoc,
    ]),
  );

  const oomRows = filterRowsWithKnownMembers(resultsData, membersMap);

  // Filter to OOM events only (check both is_oom flag and classification for backward compatibility)
  // Use case-insensitive comparison for classification
  const oomEventIds = new Set(
    (eventsData ?? [])
      .filter((e) => {
        const isOom = e.is_oom === true || (e.classification && e.classification.toLowerCase() === 'oom');
        return isOom;
      })
      .map((e) => e.id)
  );

  console.log("[resultsRepo] getOrderOfMeritTotals filter:", {
    totalEvents: (eventsData ?? []).length,
    oomEvents: oomEventIds.size,
    eventDetails: (eventsData ?? []).map((e) => ({ id: e.id, is_oom: e.is_oom, classification: e.classification })),
  });

  // Aggregate by real person key (OOM events only) — avoids duplicate society member rows
  type PersonAgg = { totalPoints: number; eventIds: Set<string>; memberIds: Set<string> };
  const byPersonKey: Record<string, PersonAgg> = {};

  oomRows.forEach((row) => {
    if (!oomEventIds.has(row.event_id)) return;
    if (!eventsMap.get(row.event_id)) return;

    const memberId = String(row.member_id);
    const member = membersMap.get(memberId);
    const stub: MemberDoc = member ?? { id: memberId, society_id: societyId };
    const personKey = canonicalJointPersonKey(stub);
    const points = Number(row.points) || 0;

    if (!byPersonKey[personKey]) {
      byPersonKey[personKey] = { totalPoints: 0, eventIds: new Set(), memberIds: new Set() };
    }
    byPersonKey[personKey].totalPoints += points;
    byPersonKey[personKey].eventIds.add(row.event_id);
    byPersonKey[personKey].memberIds.add(memberId);
  });

  const emptySocietyLabel = new Map<string, string>();
  const memberTotals: OrderOfMeritEntry[] = Object.entries(byPersonKey).map(([, agg]) => {
    const memberDocs = [...agg.memberIds]
      .map((id) => membersMap.get(id))
      .filter((m): m is MemberDoc => Boolean(m));
    const deduped =
      memberDocs.length > 0 ? dedupeJointMembers(memberDocs, emptySocietyLabel) : [];
    const rep = deduped[0]?.representative;
    const memberId = rep?.id ?? [...agg.memberIds][0] ?? "";
    const memberName =
      rep?.displayName || rep?.display_name || rep?.name || "Unknown";
    return {
      memberId,
      memberName,
      totalPoints: agg.totalPoints,
      eventsPlayed: agg.eventIds.size,
      rank: 0,
    };
  });

  // Sort by total points descending
  const sorted = memberTotals
    .filter((entry) => entry.totalPoints > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Assign ranks with tie-handling (same points = same rank)
  // e.g., 1, 1, 3, 4, 4, 6
  let currentRank = 1;
  const rankedEntries: OrderOfMeritEntry[] = sorted.map((entry, index) => {
    // If not first entry, check if points differ from previous
    if (index > 0 && entry.totalPoints < sorted[index - 1].totalPoints) {
      currentRank = index + 1;
    }
    return { ...entry, rank: currentRank };
  });

  console.log("[resultsRepo] getOrderOfMeritTotals returning:", rankedEntries.length, "entries");
  return rankedEntries;
}

/**
 * Delete all results for an event
 */
export async function deleteEventResults(eventId: string): Promise<void> {
  console.log("[resultsRepo] deleteEventResults:", eventId);

  const { error } = await supabase
    .from("event_results")
    .delete()
    .eq("event_id", eventId);

  if (error) {
    console.error("[resultsRepo] deleteEventResults failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to delete event results");
  }

  console.log("[resultsRepo] deleteEventResults success");
}

/**
 * Remove one player's saved OOM result for this event and active society (does not touch other members' rows).
 */
export async function deleteEventResultForMember(
  eventId: string,
  societyId: string,
  memberId: string,
): Promise<void> {
  if (!eventId?.trim() || !societyId?.trim() || !memberId?.trim()) {
    throw new Error("deleteEventResultForMember: missing eventId, societyId, or memberId");
  }

  const { error } = await supabase
    .from("event_results")
    .delete()
    .eq("event_id", eventId)
    .eq("society_id", societyId)
    .eq("member_id", memberId);

  if (error) {
    console.error("[resultsRepo] deleteEventResultForMember failed:", error);
    if (error.code === "42501" || error.message?.includes("policy")) {
      throw new Error("Permission denied. Only Captain or Handicapper can remove results.");
    }
    throw new Error(error.message || "Failed to remove result");
  }

  console.log("[resultsRepo] deleteEventResultForMember:", { eventId, societyId, memberId });
}

/** Remove one guest’s official result for this event and society. */
export async function deleteEventResultForGuest(
  eventId: string,
  societyId: string,
  eventGuestId: string,
): Promise<void> {
  if (!eventId?.trim() || !societyId?.trim() || !eventGuestId?.trim()) {
    throw new Error("deleteEventResultForGuest: missing eventId, societyId, or eventGuestId");
  }

  const { error } = await supabase
    .from("event_results")
    .delete()
    .eq("event_id", eventId)
    .eq("society_id", societyId)
    .eq("event_guest_id", eventGuestId);

  if (error) {
    console.error("[resultsRepo] deleteEventResultForGuest failed:", error);
    if (error.code === "42501" || error.message?.includes("policy")) {
      throw new Error("Permission denied. Only Captain or Handicapper can remove results.");
    }
    throw new Error(error.message || "Failed to remove guest result");
  }

  console.log("[resultsRepo] deleteEventResultForGuest:", { eventId, societyId, eventGuestId });
}

/**
 * Results Log entry for audit trail view
 */
export type ResultsLogEntry = {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  format: "stableford" | "medal" | string | null;
  memberId: string;
  memberName: string;
  points: number;
  dayValue: number | null;   // Raw score (stableford pts or net score)
  position: number | null;   // Finishing position (1, 2, 3...)
};

/**
 * Get Order of Merit results log (audit trail)
 * Returns raw event results grouped by event, for OOM events only.
 *
 * **Joint events:** `events.society_id` is the **host** only. Participant societies still store rows in
 * `event_results` with their own `society_id`. This function therefore starts from those rows (like
 * {@link getOrderOfMeritTotals}), then loads event metadata — so the matrix includes non-host OOM saves.
 */
export async function getOrderOfMeritLog(
  societyId: string
): Promise<ResultsLogEntry[]> {
  console.log("[resultsRepo] getOrderOfMeritLog:", societyId);

  if (!societyId) {
    throw new Error("Missing societyId");
  }

  // Society-scoped results first (includes joint guest-society rows where event host is another society).
  const { data: resultsData, error: resultsError } = await supabase
    .from("event_results")
    .select("id, event_id, society_id, member_id, points, day_value, position, updated_at")
    .eq("society_id", societyId);

  if (resultsError) {
    console.error("[resultsRepo] getOrderOfMeritLog results query failed:", resultsError);
    if (resultsError.code === "42P01") {
      return [];
    }
    throw new Error(resultsError.message || "Failed to get results");
  }

  if (!resultsData || resultsData.length === 0) {
    console.log("[resultsRepo] No results found for society");
    return [];
  }

  const candidateEventIds = [...new Set(resultsData.map((r) => r.event_id))];

  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select("id, name, date, format, classification, is_oom")
    .in("id", candidateEventIds);

  if (eventsError) {
    console.error("[resultsRepo] getOrderOfMeritLog events query failed:", eventsError);
    if (eventsError.code === "42P01") {
      return [];
    }
    throw new Error(eventsError.message || "Failed to get events");
  }

  const eventsById = new Map((eventsData ?? []).map((e) => [e.id, e]));

  const oomEvents = candidateEventIds
    .map((id) => eventsById.get(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .filter((e) => {
      const isOom = e.is_oom === true || (e.classification && e.classification.toLowerCase() === "oom");
      return isOom;
    });

  console.log("[resultsRepo] getOrderOfMeritLog filter:", {
    resultRows: resultsData.length,
    distinctEventsFromResults: candidateEventIds.length,
    oomEventsWithMetadata: oomEvents.length,
    eventDetails: oomEvents.map((e) => ({
      id: e.id,
      name: e.name,
      is_oom: e.is_oom,
      classification: e.classification,
    })),
  });

  if (oomEvents.length === 0) {
    console.log("[resultsRepo] No OOM events found for society result rows");
    return [];
  }

  oomEvents.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });

  const oomEventIdSet = new Set(oomEvents.map((e) => e.id));
  const resultsForOomOnly = resultsData
    .filter((r) => oomEventIdSet.has(r.event_id))
    .filter((r) => r.member_id != null && String(r.member_id).length > 0);

  const memberIds = [...new Set(resultsForOomOnly.map((r) => String(r.member_id)))];

  const { data: membersData, error: membersError } = await supabase
    .from("members")
    .select("id, name, display_name, society_id, user_id, email")
    .in("id", memberIds);

  if (membersError) {
    console.error("[resultsRepo] getOrderOfMeritLog members query failed:", membersError);
    throw new Error(membersError.message || "Failed to get members");
  }

  const membersMap = new Map<string, MemberDoc>(
    (membersData ?? []).map((m) => [m.id, m as MemberDoc]),
  );

  const resultsForOomWithKnownMembers = filterRowsWithKnownMembers(resultsForOomOnly, membersMap);

  const logEntries: ResultsLogEntry[] = [];

  for (const event of oomEvents) {
    const rawForEvent = resultsForOomWithKnownMembers.filter((r) => r.event_id === event.id);
    const afterMemberDedupe = dedupeEventResultsByMemberIdPreferLatest(rawForEvent);
    const afterPersonDedupe = dedupeEventResultRowsByJointPersonKey(afterMemberDedupe, membersMap);
    const eventResults = afterPersonDedupe.sort((a, b) => {
      const posA = a.position ?? 999;
      const posB = b.position ?? 999;
      if (posA !== posB) return posA - posB;
      return (Number(b.points) || 0) - (Number(a.points) || 0);
    });

    logOomMatrixDebugDev({
      societyId,
      eventId: event.id,
      eventName: event.name || "Unnamed Event",
      rawRows: rawForEvent,
      afterMemberDedupe,
      finalRows: eventResults,
      membersById: membersMap,
    });

    logOomDuplicatePlayerRowsDev({
      societyId,
      eventId: event.id,
      rows: eventResults.map((r) => ({
        id: r.id,
        member_id: r.member_id,
        points: Number(r.points) || 0,
        day_value: r.day_value ?? null,
        position: r.position ?? null,
      })),
      membersById: membersMap,
    });

    for (const result of eventResults) {
      const member = membersMap.get(result.member_id);
      logEntries.push({
        eventId: event.id,
        eventName: event.name || "Unnamed Event",
        eventDate: event.date || null,
        format: event.format || null,
        memberId: result.member_id,
        memberName: member?.name || "Unknown",
        points: result.points || 0,
        dayValue: result.day_value ?? null,
        position: result.position ?? null,
      });
    }
  }

  console.log("[resultsRepo] getOrderOfMeritLog returning:", logEntries.length, "entries");
  return logEntries;
}
