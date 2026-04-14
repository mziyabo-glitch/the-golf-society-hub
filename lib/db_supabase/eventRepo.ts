// lib/db_supabase/eventRepo.ts
import { supabase } from "@/lib/supabase";

// Event format types - simplified to core formats
// 'medal' kept as alias for backwards compatibility with existing data
export type EventFormat = 'stableford' | 'strokeplay_net' | 'strokeplay_gross' | 'medal';
export type EventClassification = 'general' | 'oom' | 'major' | 'friendly';

// Sort order: high_wins = highest score wins (stableford), low_wins = lowest score wins (strokeplay)
export const EVENT_FORMATS: { value: EventFormat; label: string; sortOrder: 'high_wins' | 'low_wins' }[] = [
  { value: 'stableford', label: 'Stableford', sortOrder: 'high_wins' },
  { value: 'strokeplay_net', label: 'Strokeplay (Net)', sortOrder: 'low_wins' },
  { value: 'strokeplay_gross', label: 'Strokeplay (Gross)', sortOrder: 'low_wins' },
];

// Helper to get sort order for a format (handles legacy 'medal' format)
export function getFormatSortOrder(format: string | undefined): 'high_wins' | 'low_wins' {
  if (!format) return 'high_wins'; // Default to stableford behavior
  const normalized = format.toLowerCase();
  // Strokeplay formats = low wins
  if (normalized.includes('strokeplay') || normalized.includes('medal') || normalized.includes('gross') || normalized.includes('net')) {
    return 'low_wins';
  }
  // Everything else (stableford) = high wins
  return 'high_wins';
}

export const EVENT_CLASSIFICATIONS: { value: EventClassification; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'oom', label: 'Order of Merit (OOM)' },
  { value: 'major', label: 'Major' },
  { value: 'friendly', label: 'Friendly' },
];

export type EventDoc = {
  id: string;
  society_id: string;
  name: string;
  date?: string;
  courseId?: string | null;
  course_id?: string;
  courseName?: string;
  tee_id?: string | null;
  format: EventFormat;
  classification: EventClassification;
  status?: string;
  isCompleted?: boolean;
  isOOM?: boolean;
  winnerName?: string;
  playerIds?: string[];
  results?: Record<string, { stableford?: number; netScore?: number; grossScore?: number }>;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  // Men's tee settings for WHS handicap calculations
  teeName?: string | null;
  par?: number | null;
  courseRating?: number | null;
  slopeRating?: number | null;
  handicapAllowance?: number | null;
  // Ladies' tee settings (different CR/Slope)
  ladiesTeeName?: string | null;
  ladiesPar?: number | null;
  ladiesCourseRating?: number | null;
  ladiesSlopeRating?: number | null;
  // Competition holes
  nearestPinHoles?: number[] | null;
  longestDriveHoles?: number[] | null;
  // Finance fields (Treasurer)
  income_pence?: number | null;
  costs_pence?: number | null;
  incomePence?: number | null;  // camelCase alias
  costsPence?: number | null;   // camelCase alias
  // Tee time publish fields
  teeTimeStart?: string | null;
  teeTimeInterval?: number | null;
  teeTimePublishedAt?: string | null;
  /** Source of tee data: 'imported' | 'manual' */
  teeSource?: "imported" | "manual" | null;
  /** Optional label e.g. £45 or £55 incl. food */
  entryFeeDisplay?: string | null;
  /** When set, public invite link stops accepting new RSVPs after this instant (timestamptz). */
  rsvp_deadline_at?: string | null;
  rsvpDeadlineAt?: string | null;
  /** Optional society prize pool alongside the main event (member opt-in is separate from main fees). */
  prize_pool_enabled?: boolean;
  prizePoolEnabled?: boolean;
  prize_pool_payment_instructions?: string | null;
  prizePoolPaymentInstructions?: string | null;
  /**
   * Canonical joint flag: true when `event_societies` has 2+ distinct society_id values
   * (same rule as `get_joint_event_detail` / `isEventJoint`). Set by repo when loading lists or `getEvent`.
   */
  is_joint_event?: boolean;
  /** Distinct societies linked in `event_societies` for this event (0 if none). */
  linked_society_count?: number;
  /** society_id values from event_societies (set by enrichEventsWithJointClassification). */
  participant_society_ids?: string[];
  [key: string]: unknown;
};

// Tee settings type for handicap calculations
export type EventTeeSettings = {
  teeName: string | null;
  par: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  handicapAllowance: number | null;
};

function mapEvent(row: any): EventDoc {
  return {
    ...row,
    courseId: row.course_id ?? null,
    courseName: row.course_name,
    format: row.format ?? 'stableford',
    classification: row.classification ?? 'general',
    isCompleted: row.is_completed ?? false,
    isOOM: row.is_oom ?? (row.classification === 'oom'),
    winnerName: row.winner_name,
    playerIds: row.player_ids ?? [],
    results: row.results ?? {},
    // Map Men's tee settings from snake_case
    teeName: row.tee_name ?? null,
    par: row.par ?? null,
    courseRating: row.course_rating ?? null,
    slopeRating: row.slope_rating ?? null,
    handicapAllowance: row.handicap_allowance ?? null,
    // Map Ladies' tee settings from snake_case
    ladiesTeeName: row.ladies_tee_name ?? null,
    ladiesPar: row.ladies_par ?? null,
    ladiesCourseRating: row.ladies_course_rating ?? null,
    ladiesSlopeRating: row.ladies_slope_rating ?? null,
    // Map competition holes
    nearestPinHoles: row.nearest_pin_holes ?? null,
    longestDriveHoles: row.longest_drive_holes ?? null,
    // Map finance fields
    incomePence: row.income_pence ?? null,
    costsPence: row.costs_pence ?? null,
    // Map tee time publish fields
    teeTimeStart: row.tee_time_start ?? null,
    teeTimeInterval: row.tee_time_interval ?? null,
    teeTimePublishedAt: row.tee_time_published_at ?? null,
    tee_id: row.tee_id ?? null,
    teeSource: row.tee_source ?? null,
    entryFeeDisplay: row.entry_fee_display?.trim() || null,
    rsvp_deadline_at: row.rsvp_deadline_at ?? null,
    rsvpDeadlineAt: row.rsvp_deadline_at ?? null,
    prize_pool_enabled: row.prize_pool_enabled ?? false,
    prizePoolEnabled: row.prize_pool_enabled ?? false,
    prize_pool_payment_instructions: row.prize_pool_payment_instructions?.trim() || null,
    prizePoolPaymentInstructions: row.prize_pool_payment_instructions?.trim() || null,
  };
}

function logJointClassificationDev(event: EventDoc, linkedSocietyCount: number, is_joint_event: boolean) {
  if (!__DEV__) return;
  console.log("[events] joint classification", {
    eventId: event.id,
    title: event.name,
    hostSocietyId: event.society_id,
    /** Distinct `society_id` values in `event_societies` for this event. Joint = this count >= 2. */
    distinctParticipatingSocieties: linkedSocietyCount,
    is_joint_event,
    ...(linkedSocietyCount === 1
      ? {
          note: "One row in event_societies — not joint until a second participating society is linked.",
        }
      : {}),
  });
}

/**
 * Attach `is_joint_event` and `linked_society_count` from `event_societies` for each event.
 */
export async function enrichEventsWithJointClassification(events: EventDoc[]): Promise<EventDoc[]> {
  if (events.length === 0) return events;
  const { getJointMetaForEventIds } = await import("@/lib/db_supabase/jointEventRepo");
  const metaMap = await getJointMetaForEventIds(events.map((e) => e.id));
  return events.map((e) => {
    const m = metaMap.get(e.id) ?? {
      is_joint_event: false,
      linkedSocietyCount: 0,
      participantSocietyIds: [] as string[],
    };
    logJointClassificationDev(e, m.linkedSocietyCount, m.is_joint_event);
    return {
      ...e,
      is_joint_event: m.is_joint_event,
      linked_society_count: m.linkedSocietyCount,
      participant_society_ids: m.participantSocietyIds,
    };
  });
}

/** Raw `events` rows for a society, mapped to EventDoc without joint enrichment. */
async function fetchMappedEventsForSociety(societyId: string): Promise<EventDoc[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("society_id", societyId)
    .order("date", { ascending: true });

  if (error) {
    console.error("[eventRepo] fetchMappedEventsForSociety failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to load events");
  }

  return (data ?? []).map(mapEvent);
}

/** Single event by id, mapped only (no joint enrichment). */
async function getEventMappedById(eventId: string): Promise<EventDoc | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    console.error("[eventRepo] getEventMappedById failed:", error.message);
    return null;
  }
  return data ? mapEvent(data) : null;
}

/**
 * Get events for a society (one-time fetch)
 */
export async function getEventsBySocietyId(societyId: string): Promise<EventDoc[]> {
  if (__DEV__) {
    console.log("[eventRepo] getEventsBySocietyId:", societyId);
  }
  const mapped = await fetchMappedEventsForSociety(societyId);
  return enrichEventsWithJointClassification(mapped);
}

/**
 * Host events + joint participant events for this society (raw rows, not joint-enriched).
 * On participant lookup failure, returns host-only rows (same behaviour as the events list).
 */
async function fetchEventsVisibleToSociety(societyId: string): Promise<EventDoc[]> {
  let hostMapped: EventDoc[];
  try {
    hostMapped = await fetchMappedEventsForSociety(societyId);
  } catch (e) {
    throw e;
  }
  try {
    const { getEventIdsWhereSocietyParticipates } = await import("@/lib/db_supabase/jointEventRepo");
    const participantEventIdList = await getEventIdsWhereSocietyParticipates(societyId);
    const hostIds = new Set(hostMapped.map((e) => e.id));
    const missingIds = participantEventIdList.filter((id) => !hostIds.has(id));
    if (missingIds.length === 0) {
      return hostMapped;
    }
    if (__DEV__) {
      console.log("[eventRepo] merge participant events:", missingIds.length, "society:", societyId);
    }
    const missingMapped = (await Promise.all(missingIds.map((id) => getEventMappedById(id)))).filter(
      (e): e is EventDoc => e != null,
    );
    const combined = [...hostMapped, ...missingMapped];
    combined.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    return combined;
  } catch (err) {
    console.warn("[eventRepo] fetchEventsVisibleToSociety: participant merge failed, host-only:", err);
    return hostMapped;
  }
}

/**
 * Get all events visible to a society: host events + joint events where society participates.
 * Use this for the main events list so participant societies see joint events too.
 */
export async function getEventsForSociety(societyId: string): Promise<EventDoc[]> {
  const merged = await fetchEventsVisibleToSociety(societyId);
  return enrichEventsWithJointClassification(merged);
}

/**
 * Get events available for the tee sheet screen: host events plus joint events where society participates.
 * Use this so joint events appear in the tee sheet event dropdown for participant societies.
 * Uses the same merge + fallback rules as {@link getEventsForSociety}.
 */
export async function getEventsForTeeSheet(societyId: string): Promise<EventDoc[]> {
  const merged = await fetchEventsVisibleToSociety(societyId);
  return enrichEventsWithJointClassification(merged);
}

/**
 * Get a single event by ID
 */
export async function getEvent(eventId: string): Promise<EventDoc | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    console.error("[eventRepo] getEvent failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return null;
  }

  return data ? mapEvent(data) : null;
}

/**
 * Create a new event
 */
export async function createEvent(
  societyId: string,
  data: {
    name: string;
    date?: string;
    courseId?: string;
    courseName?: string;
    teeId?: string | null;
    format: EventFormat;
    classification?: EventClassification;
    createdBy?: string;
    // Men's tee settings (from selected tee or manual)
    teeName?: string;
    par?: number;
    courseRating?: number;
    slopeRating?: number;
    handicapAllowance?: number;
    // Ladies' tee settings
    ladiesTeeName?: string;
    ladiesPar?: number;
    ladiesCourseRating?: number;
    ladiesSlopeRating?: number;
    /** 'imported' when from course_tees, 'manual' when user-entered */
    teeSource?: "imported" | "manual";
    /** Optional display e.g. £45 incl. food */
    entryFeeDisplay?: string | null;
  }
): Promise<EventDoc> {
  const classification = data.classification ?? 'general';

  const payload: Record<string, unknown> = {
    society_id: societyId,
    name: data.name,
    date: data.date ?? null,
    course_id: data.courseId ?? null,
    course_name: data.courseName ?? null,
    tee_id: data.teeId ?? null,
    format: data.format,
    classification: classification,
    is_oom: classification === 'oom',
    is_completed: false,
  };

  if (data.entryFeeDisplay !== undefined) {
    const t = typeof data.entryFeeDisplay === "string" ? data.entryFeeDisplay.trim() : "";
    payload.entry_fee_display = t.length > 0 ? t : null;
  }

  // Only add created_by if provided
  if (data.createdBy) {
    payload.created_by = data.createdBy;
  }

  // Add Men's tee settings if provided
  if (data.teeName !== undefined) payload.tee_name = data.teeName;
  if (data.par !== undefined) payload.par = data.par;
  if (data.courseRating !== undefined) payload.course_rating = data.courseRating;
  if (data.slopeRating !== undefined) payload.slope_rating = data.slopeRating;
  if (data.handicapAllowance !== undefined) payload.handicap_allowance = data.handicapAllowance;

  // Add Ladies' tee settings if provided
  if (data.ladiesTeeName !== undefined) payload.ladies_tee_name = data.ladiesTeeName;
  if (data.ladiesPar !== undefined) payload.ladies_par = data.ladiesPar;
  if (data.ladiesCourseRating !== undefined) payload.ladies_course_rating = data.ladiesCourseRating;
  if (data.ladiesSlopeRating !== undefined) payload.ladies_slope_rating = data.ladiesSlopeRating;
  if (data.teeSource !== undefined) payload.tee_source = data.teeSource;

  // Server-side: ensure tee_id exists in course_tees (FK events_tee_id_fkey)
  if (payload.tee_id != null && payload.tee_id !== "") {
    const { data: teeRow } = await supabase
      .from("course_tees")
      .select("id")
      .eq("id", payload.tee_id)
      .maybeSingle();
    if (!teeRow) {
      console.warn("[eventRepo] createEvent: tee_id not found in course_tees, clearing:", payload.tee_id);
      payload.tee_id = null;
    }
  }

  console.log("[eventRepo] createEvent payload:", JSON.stringify(payload, null, 2));

  let { data: row, error } = await supabase
    .from("events")
    .insert(payload)
    .select()
    .single();

  if (error) {
    if ((error as any).code === "23503" && payload.tee_id != null) {
      console.warn("[eventRepo] createEvent: FK violation on tee_id, retrying with tee_id=null:", payload.tee_id);
      payload.tee_id = null;
      const retry = await supabase.from("events").insert(payload).select().single();
      if (retry.error) {
        console.error("[eventRepo] createEvent retry failed:", retry.error.message);
        throw new Error(retry.error.message || "Failed to create event");
      }
      row = retry.data;
    } else {
      console.error("[eventRepo] createEvent failed:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error(error.message || "Failed to create event");
    }
  }

  const created = mapEvent(row);
  const [enriched] = await enrichEventsWithJointClassification([created]);
  return enriched ?? created;
}

/**
 * Update an event
 */
export async function updateEvent(
  eventId: string,
  updates: Partial<{
    name: string;
    date: string;
    courseId: string;
    courseName: string;
    teeId: string | null;
    format: EventFormat;
    classification: EventClassification;
    status: string;
    isCompleted: boolean;
    winnerName: string;
    playerIds: string[];
    // Tee time draft (save without publishing)
    teeTimeStart?: string;
    teeTimeInterval?: number;
    teeTimePublishedAt?: string | null;
    // Men's tee settings
    teeName: string;
    par: number;
    courseRating: number;
    slopeRating: number;
    handicapAllowance: number;
    // Ladies' tee settings
    ladiesTeeName: string;
    ladiesPar: number;
    ladiesCourseRating: number;
    ladiesSlopeRating: number;
    teeSource: "imported" | "manual";
    // Competition holes
    nearestPinHoles: number[];
    longestDriveHoles: number[];
    entryFeeDisplay: string | null;
    rsvpDeadlineAt: string | null;
  }>
): Promise<void> {
  const payload: Record<string, unknown> = {};

  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.date !== undefined) payload.date = updates.date;
  if (updates.courseId !== undefined) payload.course_id = updates.courseId;
  if (updates.courseName !== undefined) payload.course_name = updates.courseName;
  if (updates.teeId !== undefined) payload.tee_id = updates.teeId;
  if (updates.format !== undefined) payload.format = updates.format;
  if (updates.classification !== undefined) {
    payload.classification = updates.classification;
    payload.is_oom = updates.classification === 'oom';
  }
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.isCompleted !== undefined) payload.is_completed = updates.isCompleted;
  if (updates.winnerName !== undefined) payload.winner_name = updates.winnerName;
  if (updates.playerIds !== undefined) payload.player_ids = updates.playerIds;
  if (updates.teeTimeStart !== undefined) payload.tee_time_start = formatTeeTimeForDb(updates.teeTimeStart);
  if (updates.teeTimeInterval !== undefined) payload.tee_time_interval = updates.teeTimeInterval;
  if (updates.teeTimePublishedAt !== undefined) payload.tee_time_published_at = updates.teeTimePublishedAt;

  // Men's tee settings
  if (updates.teeName !== undefined) payload.tee_name = updates.teeName;
  if (updates.par !== undefined) payload.par = updates.par;
  if (updates.courseRating !== undefined) payload.course_rating = updates.courseRating;
  if (updates.slopeRating !== undefined) payload.slope_rating = updates.slopeRating;
  if (updates.handicapAllowance !== undefined) payload.handicap_allowance = updates.handicapAllowance;

  // Ladies' tee settings
  if (updates.ladiesTeeName !== undefined) payload.ladies_tee_name = updates.ladiesTeeName;
  if (updates.ladiesPar !== undefined) payload.ladies_par = updates.ladiesPar;
  if (updates.ladiesCourseRating !== undefined) payload.ladies_course_rating = updates.ladiesCourseRating;
  if (updates.ladiesSlopeRating !== undefined) payload.ladies_slope_rating = updates.ladiesSlopeRating;
  if (updates.teeSource !== undefined) payload.tee_source = updates.teeSource;

  // Competition holes
  if (updates.nearestPinHoles !== undefined) payload.nearest_pin_holes = updates.nearestPinHoles;
  if (updates.longestDriveHoles !== undefined) payload.longest_drive_holes = updates.longestDriveHoles;
  if (updates.entryFeeDisplay !== undefined) {
    const t = updates.entryFeeDisplay?.trim() ?? "";
    payload.entry_fee_display = t.length > 0 ? t : null;
  }
  if (updates.rsvpDeadlineAt !== undefined) {
    payload.rsvp_deadline_at = updates.rsvpDeadlineAt;
  }

  // Server-side: ensure tee_id exists in course_tees (FK events_tee_id_fkey)
  if (payload.tee_id != null && payload.tee_id !== "") {
    const { data: teeRow } = await supabase
      .from("course_tees")
      .select("id")
      .eq("id", payload.tee_id)
      .maybeSingle();
    if (!teeRow) {
      console.warn("[eventRepo] updateEvent: tee_id not found in course_tees, clearing:", payload.tee_id);
      payload.tee_id = null;
    }
  }

  console.log("[eventRepo] updateEvent:", { eventId, payload });

  let { data, error } = await supabase
    .from("events")
    .update(payload)
    .eq("id", eventId)
    .select("id, player_ids, tee_time_start, tee_time_interval, tee_time_published_at");

  if (error) {
    if ((error as any).code === "23503" && payload.tee_id != null) {
      console.warn("[eventRepo] updateEvent: FK violation on tee_id, retrying with tee_id=null:", payload.tee_id);
      payload.tee_id = null;
      const retry = await supabase
        .from("events")
        .update(payload)
        .eq("id", eventId)
        .select("id, player_ids, tee_time_start, tee_time_interval, tee_time_published_at");
      if (retry.error) {
        console.error("[eventRepo] updateEvent retry failed:", retry.error.message);
        throw new Error(retry.error.message || "Failed to update event");
      }
      data = retry.data;
    } else {
      console.error("[eventRepo] updateEvent failed:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error(error.message || "Failed to update event");
    }
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    console.error("[eventRepo] updateEvent: 0 rows updated (RLS may have blocked)");
    throw new Error("Event could not be updated. You may not have permission to edit this event.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  console.log("[eventRepo] updateEvent success, persisted player_ids:", row?.player_ids?.length ?? 0, "ids");
}

/**
 * Delete an event
 */
export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) {
    console.error("[eventRepo] deleteEvent failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to delete event");
  }
}

// =====================================================
// TEE TIME PUBLISH
// =====================================================

/**
 * Normalize start time to HH:MM:SS for Postgres TIME WITHOUT TIME ZONE.
 * Handles "11.12" -> "11:12:00", "8:30" -> "08:30:00", etc.
 */
function formatTeeTimeForDb(input: string): string {
  const s = (input || "08:00").trim() || "08:00";
  const normalized = s.replace(/\./g, ":");
  const match = normalized.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (match) {
    const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
    const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
    const sec = match[3] != null ? Math.min(59, Math.max(0, parseInt(match[3], 10))) : 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return "08:00:00";
}

/**
 * Publish tee times for an event.
 * Tries RPC first; falls back to direct UPDATE if RPC is missing (e.g. migrations not run).
 * Returns the refreshed event row so the caller has up-to-date data.
 */
export async function publishTeeTime(
  eventId: string,
  startTime: string,
  intervalMinutes: number,
): Promise<EventDoc | null> {
  const start = formatTeeTimeForDb(startTime || "08:00");
  const interval = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 10;

  if (!/^\d{2}:\d{2}:\d{2}$/.test(start)) {
    throw new Error(`Invalid tee time format: ${start}. Expected HH:MM:SS`);
  }

  // Try RPC first (migrations 038/039)
  const { error: rpcError } = await supabase.rpc("publish_tee_times", {
    p_event_id: eventId,
    p_start: start,
    p_interval: interval,
  });

  if (!rpcError) {
    return getEvent(eventId);
  }

  // Fallback: direct UPDATE (works when RPC doesn't exist)
  console.warn("[eventRepo] publishTeeTime RPC failed, trying direct update:", rpcError.message);
  const { error: updateError } = await supabase
    .from("events")
    .update({
      tee_time_start: start,
      tee_time_interval: interval,
      tee_time_published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (updateError) {
    console.error("[eventRepo] publishTeeTime direct update failed:", updateError.message);
    throw new Error(updateError.message || "Failed to publish tee times");
  }

  return getEvent(eventId);
}

/**
 * Clear published tee times so members no longer see them.
 * Uses RPC (joint events: participant ManCo cannot UPDATE events row via RLS).
 */
export async function unpublishTeeTimes(eventId: string): Promise<void> {
  if (!eventId) throw new Error("unpublishTeeTimes: missing eventId");

  const { error: rpcError } = await supabase.rpc("unpublish_tee_times", {
    p_event_id: eventId,
  });

  if (!rpcError) return;

  console.warn("[eventRepo] unpublishTeeTimes RPC failed, trying direct update:", rpcError.message);
  const { error: updateError } = await supabase
    .from("events")
    .update({
      tee_time_published_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (updateError) {
    console.error("[eventRepo] unpublishTeeTimes direct update failed:", updateError.message);
    throw new Error(updateError.message || "Failed to unpublish tee times");
  }
}

// =====================================================
// EVENT FINANCE FUNCTIONS (Captain/Treasurer only)
// =====================================================

/**
 * Update event finance (income and costs)
 * Only Captain or Treasurer can perform this action (enforced by RLS)
 *
 * @param eventId - The event to update
 * @param incomePence - Total income in pence (null to clear)
 * @param costsPence - Total costs in pence (null to clear)
 * @returns The updated event data
 */
export async function updateEventFinance(
  eventId: string,
  incomePence: number | null,
  costsPence: number | null
): Promise<EventDoc> {
  console.log("[eventRepo] updateEventFinance:", { eventId, incomePence, costsPence });

  if (!eventId) throw new Error("updateEventFinance: missing eventId");

  const payload: Record<string, unknown> = {
    income_pence: incomePence,
    costs_pence: costsPence,
  };

  const { error } = await supabase
    .from("events")
    .update(payload)
    .eq("id", eventId);

  if (error) {
    console.error("[eventRepo] updateEventFinance failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Handle RLS permission errors
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      throw new Error("Only Captain or Treasurer can update event finances.");
    }

    throw new Error(error.message || "Failed to update event finances");
  }

  // Fetch and return updated event
  const updated = await getEvent(eventId);
  if (!updated) {
    throw new Error("Event not found after update");
  }

  console.log("[eventRepo] updateEventFinance success:", eventId);
  return updated;
}

/**
 * Finance summary for a single event
 */
export type EventFinanceSummary = {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  incomePence: number;
  costsPence: number;
  netPence: number;  // income - costs
};

/**
 * Get finance summary for all events in a society
 * Returns events with finance data (where income or costs are set)
 *
 * @param societyId - The society to get summary for
 * @returns Array of event finance summaries
 */
export async function getEventsFinanceSummary(societyId: string): Promise<{
  events: EventFinanceSummary[];
  totalIncomePence: number;
  totalCostsPence: number;
  totalNetPence: number;
}> {
  console.log("[eventRepo] getEventsFinanceSummary:", societyId);

  const { data, error } = await supabase
    .from("events")
    .select("id, name, date, income_pence, costs_pence")
    .eq("society_id", societyId)
    .order("date", { ascending: false });

  if (error) {
    console.error("[eventRepo] getEventsFinanceSummary failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to get event finance summary");
  }

  const events: EventFinanceSummary[] = (data || []).map((row) => {
    const income = row.income_pence ?? 0;
    const costs = row.costs_pence ?? 0;
    return {
      eventId: row.id,
      eventName: row.name,
      eventDate: row.date ?? null,
      incomePence: income,
      costsPence: costs,
      netPence: income - costs,
    };
  });

  // Calculate totals
  const totalIncomePence = events.reduce((sum, e) => sum + e.incomePence, 0);
  const totalCostsPence = events.reduce((sum, e) => sum + e.costsPence, 0);
  const totalNetPence = totalIncomePence - totalCostsPence;

  return {
    events,
    totalIncomePence,
    totalCostsPence,
    totalNetPence,
  };
}
