import { mapRsvpErrorCodeToInlineMessage, parsePostgresRsvpMessage } from "@/lib/events/eventRsvpDomain";

/**
 * User-facing copy for public RSVP RPC errors (Postgres RAISE messages).
 *
 * ## RSVP deadline / timezone (QA)
 * - DB stores `events.rsvp_deadline_at` as **timestamptz** (absolute instant). Postgres `now()`
 *   in `get_public_event_invite_summary` / submit RPCs compares in UTC — open/closed is
 *   consistent worldwide for that instant.
 * - Captain save (`combineLocalDateTimeToRsvpIso`) parses `YYYY-MM-DD` + `HH:MM` with
 *   `new Date(\`${date}T${time}:00\`)`, which ECMAScript treats as **the device's local**
 *   timezone. Read-back in the edit form uses the same local interpretation via `Date` getters.
 * - Optional: set `EXPO_PUBLIC_RSVP_DEADLINE_DISPLAY_TZ=Europe/London` so invite + read-only
 *   deadline labels use a fixed IANA zone (BST/GMT via Intl). Edit fields still use device
 *   local unless you only operate in that zone.
 */

/** Optional IANA zone for RSVP deadline labels (invite + event detail), e.g. Europe/London. */
export function getRsvpDeadlineDisplayTimeZone(): string | undefined {
  const z =
    typeof process !== "undefined" ? process.env.EXPO_PUBLIC_RSVP_DEADLINE_DISPLAY_TZ?.trim() : "";
  return z && z.length > 0 ? z : undefined;
}

export function formatRsvpDeadlineDisplay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tz = getRsvpDeadlineDisplayTimeZone();
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(tz ? { timeZone: tz } : {}),
  });
}

/** `datetime-local` value from an ISO string (browser local). */
export function eventDateTimeLocalFromIso(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Parse `datetime-local` input to ISO for DB, or null if empty. */
export function isoFromDateTimeLocalInput(local: string): string | null {
  const t = local.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Split ISO timestamptz into local date (YYYY-MM-DD) and time (HH:MM) for captain edit form. */
export function rsvpDeadlineDateTimePartsFromIso(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

/**
 * Combine captain form fields to ISO for `events.rsvp_deadline_at`.
 * Empty date clears the deadline. Empty time defaults to 23:59 **device local**.
 * Parsed using the runtime local timezone (not `EXPO_PUBLIC_RSVP_DEADLINE_DISPLAY_TZ`).
 */
export function combineLocalDateTimeToRsvpIso(dateStr: string, timeStr: string): string | null {
  const ds = dateStr.trim();
  if (!ds) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return null;
  const rawT = timeStr.trim();
  let hh = "23";
  let mm = "59";
  if (rawT) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(rawT);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    hh = String(h).padStart(2, "0");
    mm = String(min).padStart(2, "0");
  }
  const d = new Date(`${ds}T${hh}:${mm}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function mapPublicRsvpError(raw: string): string {
  const code = parsePostgresRsvpMessage(raw);
  const mapped = mapRsvpErrorCodeToInlineMessage(code);
  if (mapped) return mapped;
  const m = raw || "";
  return m || "Something went wrong. Please try again.";
}
