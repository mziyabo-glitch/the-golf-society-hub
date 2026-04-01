import { supabase } from "@/lib/supabase";
import { getMembersByIds } from "@/lib/db_supabase/memberRepo";

export type CourseStatusValue = "open" | "restricted" | "temp_greens" | "closed";

export type EventCourseStatusRow = {
  id: string;
  event_id: string;
  society_id: string;
  member_id: string;
  status: CourseStatusValue;
  note: string | null;
  created_at: string;
  reporterName?: string | null;
};

const STATUS_SET = new Set<CourseStatusValue>(["open", "restricted", "temp_greens", "closed"]);

function mapRow(row: any): EventCourseStatusRow {
  const status = row.status as string;
  const safe: CourseStatusValue = STATUS_SET.has(status as CourseStatusValue)
    ? (status as CourseStatusValue)
    : "open";
  return {
    id: row.id,
    event_id: row.event_id,
    society_id: row.society_id,
    member_id: row.member_id,
    status: safe,
    note: row.note ?? null,
    created_at: row.created_at,
    reporterName: null,
  };
}

/**
 * Latest course status reports for an event (newest first).
 */
export async function listEventCourseStatusUpdates(eventId: string, limit = 20): Promise<EventCourseStatusRow[]> {
  const { data, error } = await supabase
    .from("event_course_status_updates")
    .select("id, event_id, society_id, member_id, status, note, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      console.warn("[eventCourseStatusRepo] table missing — apply migration 086");
      return [];
    }
    console.error("[eventCourseStatusRepo] list failed:", error.message);
    return [];
  }

  const rows = (data ?? []).map((row: any) => mapRow(row));
  const ids = [...new Set(rows.map((r) => r.member_id).filter(Boolean))];
  if (ids.length === 0) return rows;

  const members = await getMembersByIds(ids);
  const nameById = new Map(
    members.map((m) => [m.id, (m.displayName ?? m.name)?.trim() || null]),
  );

  return rows.map((r) => ({
    ...r,
    reporterName: nameById.get(r.member_id) ?? null,
  }));
}

export async function createEventCourseStatusUpdate(input: {
  eventId: string;
  societyId: string;
  memberId: string;
  status: CourseStatusValue;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!STATUS_SET.has(input.status)) {
    return { ok: false, error: "Invalid status" };
  }

  const { error } = await supabase.from("event_course_status_updates").insert({
    event_id: input.eventId,
    society_id: input.societyId,
    member_id: input.memberId,
    status: input.status,
    note: input.note?.trim() || null,
  });

  if (error) {
    console.error("[eventCourseStatusRepo] insert failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
