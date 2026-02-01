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
    .select("id,name,date,format,classification,course_name,status,is_completed,winner_name,player_ids,created_at,created_by,society_id,tee_name,par,course_rating,slope_rating,handicap_allowance,ladies_tee_name,ladies_par,ladies_course_rating,ladies_slope_rating,nearest_pin_holes,longest_drive_holes")
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
    // Men's tee settings
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
    // Competition holes
    nearestPinHoles: number[];
    longestDriveHoles: number[];
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

  // Competition holes
  if (updates.nearestPinHoles !== undefined) payload.nearest_pin_holes = updates.nearestPinHoles;
  if (updates.longestDriveHoles !== undefined) payload.longest_drive_holes = updates.longestDriveHoles;

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
