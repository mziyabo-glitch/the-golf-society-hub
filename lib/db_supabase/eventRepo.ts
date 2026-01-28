// lib/db_supabase/eventRepo.ts
import { supabase } from "@/lib/supabase";

// Event format types
export type EventFormat = 'medal' | 'stableford' | 'matchplay' | 'scramble' | 'texas_scramble' | 'fourball' | 'foursomes';
export type EventClassification = 'general' | 'oom' | 'major' | 'friendly';

export const EVENT_FORMATS: { value: EventFormat; label: string }[] = [
  { value: 'stableford', label: 'Stableford' },
  { value: 'medal', label: 'Medal (Stroke Play)' },
  { value: 'matchplay', label: 'Match Play' },
  { value: 'scramble', label: 'Scramble' },
  { value: 'texas_scramble', label: 'Texas Scramble' },
  { value: 'fourball', label: 'Four-Ball' },
  { value: 'foursomes', label: 'Foursomes' },
];

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
  course_id?: string;
  courseName?: string;
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
  [key: string]: unknown;
};

function mapEvent(row: any): EventDoc {
  return {
    ...row,
    courseName: row.course_name,
    format: row.format ?? 'stableford',
    classification: row.classification ?? 'general',
    isCompleted: row.is_completed ?? false,
    isOOM: row.is_oom ?? (row.classification === 'oom'),
    winnerName: row.winner_name,
    playerIds: row.player_ids ?? [],
    results: row.results ?? {},
  };
}

/**
 * Get events for a society (one-time fetch)
 */
export async function getEventsBySocietyId(societyId: string): Promise<EventDoc[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("society_id", societyId)
    .order("date", { ascending: false });

  if (error) {
    console.error("[eventRepo] getEventsBySocietyId failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return [];
  }

  return (data ?? []).map(mapEvent);
}

/**
 * Get a single event by ID
 */
export async function getEvent(eventId: string): Promise<EventDoc | null> {
  console.log("[eventRepo] getEvent called with id:", eventId);

  const { data, error } = await supabase
    .from("events")
    .select("id,name,date,format,classification,course_name,status,is_completed,winner_name,player_ids,created_at,created_by,society_id")
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
    format: EventFormat;
    classification?: EventClassification;
    createdBy?: string;
  }
): Promise<EventDoc> {
  const classification = data.classification ?? 'general';

  const payload: Record<string, unknown> = {
    society_id: societyId,
    name: data.name,
    date: data.date ?? null,
    course_id: data.courseId ?? null,
    course_name: data.courseName ?? null,
    format: data.format,
    classification: classification,
    is_oom: classification === 'oom',
    is_completed: false,
  };

  // Only add created_by if provided
  if (data.createdBy) {
    payload.created_by = data.createdBy;
  }

  console.log("[eventRepo] createEvent payload:", JSON.stringify(payload, null, 2));

  const { data: row, error } = await supabase
    .from("events")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("[eventRepo] createEvent failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to create event");
  }

  return mapEvent(row);
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
    format: EventFormat;
    classification: EventClassification;
    status: string;
    isCompleted: boolean;
    winnerName: string;
    playerIds: string[];
  }>
): Promise<void> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.date !== undefined) payload.date = updates.date;
  if (updates.courseId !== undefined) payload.course_id = updates.courseId;
  if (updates.courseName !== undefined) payload.course_name = updates.courseName;
  if (updates.format !== undefined) payload.format = updates.format;
  if (updates.classification !== undefined) {
    payload.classification = updates.classification;
    payload.is_oom = updates.classification === 'oom';
  }
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.isCompleted !== undefined) payload.is_completed = updates.isCompleted;
  if (updates.winnerName !== undefined) payload.winner_name = updates.winnerName;
  if (updates.playerIds !== undefined) payload.player_ids = updates.playerIds;

  console.log("[eventRepo] updateEvent:", { eventId, payload });

  const { data, error } = await supabase
    .from("events")
    .update(payload)
    .eq("id", eventId)
    .select();

  if (error) {
    console.error("[eventRepo] updateEvent failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to update event");
  }

  console.log("[eventRepo] updateEvent success:", data);
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
