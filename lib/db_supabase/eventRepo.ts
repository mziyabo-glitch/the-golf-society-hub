// lib/db_supabase/eventRepo.ts
import { supabase } from "@/lib/supabase";

export type EventDoc = {
  id: string;
  society_id: string;
  name: string;
  date?: string;
  course_id?: string;
  courseName?: string;
  format?: string;
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
    isCompleted: row.is_completed ?? false,
    isOOM: row.is_oom ?? false,
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
    .select(
      "id, society_id, name, date, created_by, created_at, updated_at, status, course_id, course_name, male_tee_set_id, female_tee_set_id, handicap_allowance_pct, handicap_allowance, format, player_ids, tee_sheet, is_completed, is_oom, winner_id, winner_name, tee_sheet_notes, results, event_fee"
    )
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
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, society_id, name, date, created_by, created_at, updated_at, status, course_id, course_name, male_tee_set_id, female_tee_set_id, handicap_allowance_pct, handicap_allowance, format, player_ids, tee_sheet, is_completed, is_oom, winner_id, winner_name, tee_sheet_notes, results, event_fee"
    )
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
    format?: string;
    isOOM?: boolean;
    createdBy?: string;
  }
): Promise<EventDoc> {
  const payload: Record<string, unknown> = {
    society_id: societyId,
    name: data.name,
    date: data.date ?? null,
    course_id: data.courseId ?? null,
    course_name: data.courseName ?? null,
    format: data.format ?? null,
    is_oom: data.isOOM ?? false,
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
    format: string;
    status: string;
    isCompleted: boolean;
    isOOM: boolean;
    winnerName: string;
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
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.isCompleted !== undefined) payload.is_completed = updates.isCompleted;
  if (updates.isOOM !== undefined) payload.is_oom = updates.isOOM;
  if (updates.winnerName !== undefined) payload.winner_name = updates.winnerName;

  const { error } = await supabase
    .from("events")
    .update(payload)
    .eq("id", eventId);

  if (error) {
    console.error("[eventRepo] updateEvent failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to update event");
  }
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
