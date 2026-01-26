// lib/db_supabase/eventRepo.ts
import { supabase } from "@/lib/supabase";

export type EventDoc = {
  id: string;
  society_id: string;
  name: string;
  date?: string;
  course_id?: string;
  courseName?: string;
  isCompleted?: boolean;
  isOOM?: boolean;
  winnerName?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

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
    // Return empty array instead of throwing - table might not exist yet
    return [];
  }

  return (data ?? []).map((e) => ({
    ...e,
    courseName: e.course_name,
    isCompleted: e.is_completed,
    isOOM: e.is_oom,
    winnerName: e.winner_name,
  }));
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

  if (!data) return null;

  return {
    ...data,
    courseName: data.course_name,
    isCompleted: data.is_completed,
    isOOM: data.is_oom,
    winnerName: data.winner_name,
  };
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
    isOOM?: boolean;
  }
): Promise<EventDoc> {
  const payload = {
    society_id: societyId,
    name: data.name,
    date: data.date ?? null,
    course_id: data.courseId ?? null,
    course_name: data.courseName ?? null,
    is_oom: data.isOOM ?? false,
    is_completed: false,
  };

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

  return {
    ...row,
    courseName: row.course_name,
    isCompleted: row.is_completed,
    isOOM: row.is_oom,
    winnerName: row.winner_name,
  };
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
