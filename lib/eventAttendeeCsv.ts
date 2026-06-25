/**
 * Event attendee CSV export — joint (de-duped) and society-scoped rows.
 */

import type { EventGuest } from "@/lib/db_supabase/eventGuestRepo";
import type { MemberDoc, Gender } from "@/lib/db_supabase/memberRepo";
import type { JointEventAttendeeRow } from "@/lib/jointEventSignups";
import { formatHandicap } from "@/lib/whs";

function guestPlayerIdForExport(guestId: string): string {
  return `guest-${String(guestId)}`;
}

export const EVENT_ATTENDEE_CSV_HEADERS = [
  "Name",
  "Society registered through",
  "Member/Guest",
  "Paid status",
  "HI",
  "PH",
  "Tee assignment",
  "Gender/sex",
  "Email",
  "Phone",
  "Notes",
] as const;

export type EventAttendeeCsvRow = Record<(typeof EVENT_ATTENDEE_CSV_HEADERS)[number], string>;

export type AttendeeTeeSheetOverlay = {
  handicapIndex?: number | null;
  playingHandicap?: number | null;
  teeAssignment?: "men" | "ladies" | null;
  gender?: Gender;
  groupLabel?: string;
};

function escapeCsvCell(value: string): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function formatGenderForCsv(gender: Gender | "male" | "female" | null | undefined): string {
  if (gender === "male") return "Male";
  if (gender === "female") return "Female";
  return "";
}

export function formatTeeAssignmentForCsv(tee: "men" | "ladies" | null | undefined): string {
  if (tee === "men") return "Men";
  if (tee === "ladies") return "Ladies";
  return "";
}

/** Member vs guest from merged attendee row. */
export function memberGuestKindFromAttendeeRow(row: JointEventAttendeeRow): "Member" | "Guest" {
  const guestOnly = !!row.guestId && row.registrations.length === 0;
  return guestOnly ? "Guest" : "Member";
}

function representativeMemberId(row: JointEventAttendeeRow): string | null {
  const reg = row.registrations[0];
  return reg ? String(reg.member_id) : null;
}

function playerIdForAttendeeRow(row: JointEventAttendeeRow): string | null {
  if (row.guestId && row.registrations.length === 0) {
    return guestPlayerIdForExport(row.guestId);
  }
  return representativeMemberId(row);
}

function societyRegisteredThrough(row: JointEventAttendeeRow): string {
  const badge = row.societyBadge?.trim();
  if (badge) return badge;
  const names = [...new Set(row.sources.map((s) => s.societyName).filter(Boolean))];
  return names.join(" / ");
}

function lookupMember(
  row: JointEventAttendeeRow,
  membersById: Map<string, MemberDoc>,
): MemberDoc | undefined {
  const mid = representativeMemberId(row);
  if (!mid) return undefined;
  return membersById.get(mid);
}

function lookupGuest(
  row: JointEventAttendeeRow,
  guestsById: Map<string, EventGuest>,
): EventGuest | undefined {
  if (!row.guestId) return undefined;
  return guestsById.get(String(row.guestId));
}

export function buildEventAttendeeCsvRow(
  row: JointEventAttendeeRow,
  membersById: Map<string, MemberDoc>,
  guestsById: Map<string, EventGuest>,
  teeOverlayByPlayerId?: Map<string, AttendeeTeeSheetOverlay>,
): EventAttendeeCsvRow {
  const member = lookupMember(row, membersById);
  const guest = lookupGuest(row, guestsById);
  const playerId = playerIdForAttendeeRow(row);
  const overlay = playerId ? teeOverlayByPlayerId?.get(playerId) : undefined;

  const hi =
    overlay?.handicapIndex ??
    member?.handicapIndex ??
    member?.handicap_index ??
    guest?.handicap_index ??
    null;
  const ph = overlay?.playingHandicap ?? null;
  const tee = overlay?.teeAssignment ?? null;
  const gender = overlay?.gender ?? member?.gender ?? guest?.sex ?? null;

  const groupLabel = overlay?.groupLabel?.trim() ?? "";
  const notes = groupLabel ? `Group: ${groupLabel}` : "";

  return {
    Name: row.displayName.trim(),
    "Society registered through": societyRegisteredThrough(row),
    "Member/Guest": memberGuestKindFromAttendeeRow(row),
    "Paid status": row.paymentLabel.trim() || "Unpaid",
    HI: hi != null && Number.isFinite(Number(hi)) ? formatHandicap(hi, 1) : "",
    PH: ph != null && Number.isFinite(Number(ph)) ? formatHandicap(ph) : "",
    "Tee assignment": formatTeeAssignmentForCsv(tee),
    "Gender/sex": formatGenderForCsv(gender),
    Email: (member?.email ?? "").trim(),
    Phone: (member?.emergency_contact ?? "").trim(),
    Notes: notes,
  };
}

export function buildEventAttendeeCsvRows(
  attendeeRows: JointEventAttendeeRow[],
  membersById: Map<string, MemberDoc>,
  guestsById: Map<string, EventGuest>,
  teeOverlayByPlayerId?: Map<string, AttendeeTeeSheetOverlay>,
): EventAttendeeCsvRow[] {
  return attendeeRows
    .map((row) => buildEventAttendeeCsvRow(row, membersById, guestsById, teeOverlayByPlayerId))
    .sort((a, b) => a.Name.localeCompare(b.Name));
}

export function buildEventAttendeeCsvContent(rows: EventAttendeeCsvRow[]): string {
  const lines = [
    EVENT_ATTENDEE_CSV_HEADERS.join(","),
    ...rows.map((row) => EVENT_ATTENDEE_CSV_HEADERS.map((h) => escapeCsvCell(row[h])).join(",")),
  ];
  return lines.join("\r\n");
}

export function safeCsvFilenamePart(name: string): string {
  return name.trim().replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80) || "event";
}

export function downloadCsvOnWeb(content: string, filename: string): void {
  if (typeof document === "undefined") {
    throw new Error("CSV download is only available on web.");
  }
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type TeeOverlayGroupInput = {
  groupNumber: number;
  players: {
    id: string;
    handicapIndex?: number | null;
    playingHandicap?: number | null;
    teeAssignment?: "men" | "ladies" | null;
    gender?: Gender;
  }[];
};

/** Map player id (member uuid or guest-{id}) to tee sheet fields for CSV export. */
export function teeOverlayMapFromGroups(groups: TeeOverlayGroupInput[]): Map<string, AttendeeTeeSheetOverlay> {
  const out = new Map<string, AttendeeTeeSheetOverlay>();
  for (const g of groups) {
    const groupLabel = g.groupNumber === 0 ? "Unassigned" : `Group ${g.groupNumber}`;
    for (const p of g.players) {
      const id = String(p.id);
      if (!id) continue;
      out.set(id, {
        handicapIndex: p.handicapIndex ?? null,
        playingHandicap: p.playingHandicap ?? null,
        teeAssignment: p.teeAssignment ?? null,
        gender: p.gender ?? null,
        groupLabel,
      });
    }
  }
  return out;
}

export function membersByIdFromLists(...lists: MemberDoc[][]): Map<string, MemberDoc> {
  const out = new Map<string, MemberDoc>();
  for (const list of lists) {
    for (const m of list) {
      if (m?.id) out.set(String(m.id), m);
    }
  }
  return out;
}

export function guestsByIdFromList(guests: EventGuest[]): Map<string, EventGuest> {
  return new Map(guests.map((g) => [String(g.id), g]));
}
