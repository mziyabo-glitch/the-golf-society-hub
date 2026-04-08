/**
 * iCal feed for members with RSVP "in" — used by Vercel /api/calendar/* and local dev-api-server.
 *
 * - Timed events: wall clock in Europe/London (GMT in winter, BST in summer) → DTSTART/DTEND as UTC `...Z`.
 * - All-day: no tee time → DATE-only form; DTEND is exclusive next calendar day (RFC 5545).
 * - VEVENT UID is stable (lowercase event uuid @ fixed domain) so refreshes update the same entries.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addDays, addHours, format, isValid, parseISO } from "date-fns";
import { toDate } from "date-fns-tz";

const TZ = "Europe/London";
/** Domain suffix keeps UID stable across feed generations (must not change once shipped). */
const VEVENT_UID_DOMAIN = "calendar.golf-society-hub";

type EventRow = {
  id: string;
  name: string;
  date: string | null;
  course_name: string | null;
  format: string | null;
  classification: string | null;
  tee_time_start: string | null;
  status: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function foldLine(line: string): string {
  const max = 75;
  if (line.length <= max) return line;
  let out = "";
  let rest = line;
  while (rest.length > max) {
    out += `${rest.slice(0, max)}\r\n `;
    rest = rest.slice(max);
  }
  return out + rest;
}

function formatIcsUtc(dt: Date): string {
  if (Number.isNaN(dt.getTime())) {
    return `${new Date(0).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  }
  return `${dt.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** Revision time for DTSTAMP / LAST-MODIFIED — stable unless the event row changes in the DB. */
function componentRevisionUtc(ev: EventRow): Date {
  const tryParse = (s: string | null | undefined): Date | null => {
    if (!s?.trim()) return null;
    const d = new Date(s.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  };
  return (
    tryParse(ev.updated_at) ??
    tryParse(ev.created_at) ??
    (ev.date && isValid(parseISO(ev.date)) ? parseISO(ev.date) : null) ??
    new Date(0)
  );
}

function normalizeTeeTime(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = m[1].padStart(2, "0");
  const min = m[2];
  const s = (m[3] ?? "00").padStart(2, "0");
  return `${h}:${min}:${s}`;
}

function buildDescription(ev: EventRow): string {
  const parts: string[] = [];
  if (ev.course_name?.trim()) parts.push(`Course: ${ev.course_name.trim()}`);
  if (ev.format?.trim()) parts.push(`Format: ${ev.format.trim()}`);
  if (ev.classification?.trim()) parts.push(`Type: ${ev.classification.trim()}`);
  parts.push("Your RSVP: In");
  return parts.join("\n");
}

function createAdmin(): SupabaseClient | null {
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) return null;
  return createClient(url.trim(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function buildCalendarResponse(
  events: EventRow[],
): { status: number; body: string; headers: Record<string, string> } {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Golf Society Hub//Member RSVP Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Golf Society — My IN RSVPs",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
  ];

  for (const ev of events) {
    if (!ev.date || ev.status === "cancelled") continue;

    const dayParsed = parseISO(ev.date);
    if (!isValid(dayParsed)) continue;

    const uid = `${String(ev.id).trim().toLowerCase()}@${VEVENT_UID_DOMAIN}`;
    const summary = escapeIcsText(ev.name?.trim() || "Event");
    const loc = ev.course_name?.trim() ? escapeIcsText(ev.course_name.trim()) : "";
    const desc = escapeIcsText(buildDescription(ev));
    const tee = normalizeTeeTime(ev.tee_time_start);
    const rev = formatIcsUtc(componentRevisionUtc(ev));

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${rev}`);
    lines.push(`LAST-MODIFIED:${rev}`);

    if (tee) {
      const startStr = `${ev.date}T${tee}`;
      const start = toDate(startStr, { timeZone: TZ });
      if (Number.isNaN(start.getTime())) continue;
      const end = addHours(start, 4);
      lines.push(`DTSTART:${formatIcsUtc(start)}`);
      lines.push(`DTEND:${formatIcsUtc(end)}`);
    } else {
      const startDay = format(dayParsed, "yyyyMMdd");
      const endDay = format(addDays(dayParsed, 1), "yyyyMMdd");
      lines.push(`DTSTART;VALUE=DATE:${startDay}`);
      lines.push(`DTEND;VALUE=DATE:${endDay}`);
    }

    lines.push(foldLine(`SUMMARY:${summary}`));
    if (loc) lines.push(foldLine(`LOCATION:${loc}`));
    lines.push(foldLine(`DESCRIPTION:${desc}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  const body = `${lines.join("\r\n")}\r\n`;
  return {
    status: 200,
    body,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=120",
    },
  };
}

/**
 * @param pathLastSegment — URL segment e.g. `opaqueToken.ics`
 */
export async function getCalendarIcsForToken(pathLastSegment: string): Promise<{
  status: number;
  body: string;
  headers: Record<string, string>;
}> {
  const segment = pathLastSegment.trim();
  if (!segment.endsWith(".ics")) {
    return { status: 404, body: "Not found", headers: { "Content-Type": "text/plain; charset=utf-8" } };
  }
  const token = segment.slice(0, -4);
  if (!token || token.length < 16) {
    return { status: 404, body: "Not found", headers: { "Content-Type": "text/plain; charset=utf-8" } };
  }

  const admin = createAdmin();
  if (!admin) {
    return {
      status: 503,
      body: "Calendar feed unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    };
  }

  const { data: row, error: e1 } = await admin
    .from("calendar_feed_tokens")
    .select("member_id,society_id")
    .eq("token", token)
    .maybeSingle();

  if (e1 || !row) {
    return { status: 404, body: "Not found", headers: { "Content-Type": "text/plain; charset=utf-8" } };
  }

  const { data: regs, error: e2 } = await admin
    .from("event_registrations")
    .select("event_id")
    .eq("member_id", row.member_id)
    .eq("society_id", row.society_id)
    .eq("status", "in");

  if (e2) {
    return {
      status: 500,
      body: "Failed to load registrations",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    };
  }

  if (!regs?.length) {
    return buildCalendarResponse([]);
  }

  const eventIds = [...new Set(regs.map((r: { event_id: string }) => r.event_id))];
  const { data: events, error: e3 } = await admin
    .from("events")
    .select("id,name,date,course_name,format,classification,tee_time_start,status,updated_at,created_at")
    .in("id", eventIds);

  if (e3) {
    return {
      status: 500,
      body: "Failed to load events",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    };
  }

  const list = (events ?? []) as EventRow[];
  list.sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return da.localeCompare(db);
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  return buildCalendarResponse(list);
}
