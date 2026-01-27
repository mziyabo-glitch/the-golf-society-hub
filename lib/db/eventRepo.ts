import { supabase } from "@/lib/supabase";

export type EventDoc = {
  id: string;
  societyId: string;
  name: string;
  date?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  status?: string | null;
  courseId?: string | null;
  courseName?: string | null;
  maleTeeSetId?: string | null;
  femaleTeeSetId?: string | null;
  handicapAllowancePct?: number | null;
  handicapAllowance?: number | null;
  format?: string | null;
  playerIds?: string[];
  teeSheet?: {
    startTimeISO: string;
    intervalMins: number;
    groups: Array<{ timeISO: string; players: string[] }>;
  };
  isCompleted?: boolean;
  isOOM?: boolean;
  winnerId?: string | null;
  winnerName?: string | null;
  teeSheetNotes?: string | null;
  results?: {
    [memberId: string]: {
      grossScore: number;
      netScore?: number;
      stableford?: number;
      strokeplay?: number;
    };
  };
  eventFee?: number | null;
  payments?: Record<
    string,
    {
      paid: boolean;
      paidAtISO?: string;
      method?: "cash" | "bank" | "other";
    }
  >;
};

type CreateEventPayload = {
  name: string;
  date?: string;
  createdBy?: string;
  courseId?: string;
  courseName?: string;
  format?: string;
  isOOM?: boolean;
};

function mapEvent(row: any): EventDoc {
  return {
    id: row.id,
    societyId: row.society_id,
    name: row.name,
    date: row.date ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    status: row.status ?? null,
    courseId: row.course_id ?? null,
    courseName: row.course_name ?? null,
    maleTeeSetId: row.male_tee_set_id ?? null,
    femaleTeeSetId: row.female_tee_set_id ?? null,
    handicapAllowancePct: row.handicap_allowance_pct ?? null,
    handicapAllowance: row.handicap_allowance ?? null,
    format: row.format ?? null,
    playerIds: Array.isArray(row.player_ids) ? row.player_ids : [],
    teeSheet: row.tee_sheet ?? undefined,
    isCompleted: row.is_completed ?? false,
    isOOM: row.is_oom ?? false,
    winnerId: row.winner_id ?? null,
    winnerName: row.winner_name ?? null,
    teeSheetNotes: row.tee_sheet_notes ?? null,
    results: row.results ?? undefined,
    eventFee: row.event_fee ?? null,
  };
}

async function getEventPaymentsMap(eventId: string) {
  const { data, error } = await supabase
    .from("event_payments")
    .select("member_id, paid, paid_at")
    .eq("event_id", eventId);

  if (error) {
    return {};
  }

  const map: Record<string, any> = {};
  (data ?? []).forEach((row) => {
    map[row.member_id] = {
      paid: row.paid ?? false,
      paidAtISO: row.paid_at ?? undefined,
    };
  });
  return map;
}

export async function createEvent(
  societyId: string,
  payload: CreateEventPayload
): Promise<EventDoc> {
  const data: Record<string, unknown> = {
    society_id: societyId,
    name: payload.name,
    date: payload.date ?? null,
    course_id: payload.courseId ?? null,
    course_name: payload.courseName ?? null,
    format: payload.format ?? null,
    is_oom: payload.isOOM ?? false,
  };

  if (payload.createdBy) {
    data.created_by = payload.createdBy;
  }

  const { data: row, error } = await supabase
    .from("events")
    .insert(data)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to create event");
  }

  return mapEvent(row);
}

export async function getEventDoc(id: string): Promise<EventDoc | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to get event");
  }
  return data ? mapEvent(data) : null;
}

export async function getEvent(
  societyId: string,
  eventId: string
): Promise<EventDoc | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("society_id", societyId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to get event");
  }
  if (!data) return null;

  const event = mapEvent(data);
  const payments = await getEventPaymentsMap(eventId);
  return { ...event, payments };
}

export function subscribeEventDoc(
  id: string,
  onChange: (event: EventDoc | null) => void,
  onError?: (error: Error) => void
): () => void {
  let active = true;

  const fetchOnce = async () => {
    try {
      const doc = await getEventDoc(id);
      if (active) onChange(doc);
    } catch (error: any) {
      if (active && onError) onError(error);
    }
  };

  fetchOnce();
  const timer = setInterval(fetchOnce, 5000);

  return () => {
    active = false;
    clearInterval(timer);
  };
}

export async function updateEventDoc(id: string, updates: Partial<EventDoc>): Promise<void> {
  const payload: Record<string, unknown> = {};

  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.date !== undefined) payload.date = updates.date;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.courseId !== undefined) payload.course_id = updates.courseId;
  if (updates.courseName !== undefined) payload.course_name = updates.courseName;
  if (updates.format !== undefined) payload.format = updates.format;
  if (updates.isCompleted !== undefined) payload.is_completed = updates.isCompleted;
  if (updates.isOOM !== undefined) payload.is_oom = updates.isOOM;
  if (updates.winnerId !== undefined) payload.winner_id = updates.winnerId;
  if (updates.winnerName !== undefined) payload.winner_name = updates.winnerName;
  if (updates.playerIds !== undefined) payload.player_ids = updates.playerIds;
  if (updates.teeSheet !== undefined) payload.tee_sheet = updates.teeSheet;
  if (updates.teeSheetNotes !== undefined) payload.tee_sheet_notes = updates.teeSheetNotes;
  if (updates.maleTeeSetId !== undefined) payload.male_tee_set_id = updates.maleTeeSetId;
  if (updates.femaleTeeSetId !== undefined) payload.female_tee_set_id = updates.femaleTeeSetId;
  if (updates.handicapAllowancePct !== undefined) {
    payload.handicap_allowance_pct = updates.handicapAllowancePct;
  }
  if (updates.handicapAllowance !== undefined) {
    payload.handicap_allowance = updates.handicapAllowance;
  }
  if (updates.results !== undefined) payload.results = updates.results;
  if (updates.eventFee !== undefined) payload.event_fee = updates.eventFee;

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from("events")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(error.message || "Failed to update event");
  }
}

export async function listEventsBySociety(societyId: string): Promise<EventDoc[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("society_id", societyId)
    .order("date", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load events");
  }

  return (data ?? []).map(mapEvent);
}

export async function getEventsBySocietyId(societyId: string): Promise<EventDoc[]> {
  return listEventsBySociety(societyId);
}

export function subscribeEventsBySociety(
  societyId: string,
  onChange: (events: EventDoc[]) => void,
  onError?: (error: Error) => void
): () => void {
  let active = true;

  const fetchOnce = async () => {
    try {
      const items = await listEventsBySociety(societyId);
      if (active) onChange(items);
    } catch (error: any) {
      if (active && onError) onError(error);
    }
  };

  fetchOnce();
  const timer = setInterval(fetchOnce, 5000);

  return () => {
    active = false;
    clearInterval(timer);
  };
}

export async function setEventFee(
  societyId: string,
  eventId: string,
  fee: number
): Promise<void> {
  const { error } = await supabase
    .from("events")
    .update({ event_fee: fee, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("society_id", societyId);

  if (error) {
    throw new Error(error.message || "Failed to update event fee");
  }
}

export async function setEventPaymentStatus(
  societyId: string,
  eventId: string,
  memberId: string,
  paid: boolean
): Promise<void> {
  const payloadWithSociety: Record<string, unknown> = {
    society_id: societyId,
    event_id: eventId,
    member_id: memberId,
    paid,
    paid_at: paid ? new Date().toISOString() : null,
  };

  let payloadForWrite: Record<string, unknown> = payloadWithSociety;
  let { error } = await supabase
    .from("event_payments")
    .upsert(payloadForWrite, { onConflict: "event_id,member_id" });

  if (error) {
    if (error.code === "42703") {
      const fallback = {
        event_id: eventId,
        member_id: memberId,
        paid,
        paid_at: paid ? new Date().toISOString() : null,
      };
      payloadForWrite = fallback;
      const { error: fallbackError } = await supabase
        .from("event_payments")
        .upsert(fallback, { onConflict: "event_id,member_id" });
      if (!fallbackError) return;
      error = fallbackError;
    }
    if (error.code === "42P10") {
      const { data: updated, error: updateError } = await supabase
        .from("event_payments")
        .update(payloadForWrite)
        .eq("event_id", eventId)
        .eq("member_id", memberId)
        .select("member_id");
      if (!updateError && updated && updated.length > 0) return;

      const { error: insertError } = await supabase
        .from("event_payments")
        .insert(payloadForWrite);
      if (!insertError) return;
      throw new Error(insertError.message || "Failed to update payment status");
    }
    throw new Error(error.message || "Failed to update payment status");
  }
}
