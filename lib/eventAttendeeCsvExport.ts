import { Platform } from "react-native";

import type { EventGuest } from "@/lib/db_supabase/eventGuestRepo";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { JointEventAttendeeRow } from "@/lib/jointEventSignups";
import { loadCanonicalTeeSheet } from "@/lib/teeSheet/canonicalTeeSheet";
import {
  buildEventAttendeeCsvContent,
  buildEventAttendeeCsvRows,
  downloadCsvOnWeb,
  guestsByIdFromList,
  safeCsvFilenamePart,
  teeOverlayMapFromGroups,
  type TeeOverlayGroupInput,
} from "@/lib/eventAttendeeCsv";

export type ExportEventAttendeesCsvOpts = {
  eventId: string;
  eventName: string;
  eventDate?: string | null;
  attendeeRows: JointEventAttendeeRow[];
  membersById: Map<string, MemberDoc>;
  guests: EventGuest[];
  /** When provided (e.g. tee sheet editor), used instead of loading canonical tee sheet. */
  teeOverlayGroups?: TeeOverlayGroupInput[];
  /** When true, loads canonical tee sheet for HI/PH/group overlay (manage / event overview). */
  loadTeeSheetOverlay?: boolean;
};

export async function exportEventAttendeesCsv(opts: ExportEventAttendeesCsvOpts): Promise<void> {
  if (Platform.OS !== "web") {
    throw new Error("Attendee CSV export is available on web.");
  }

  let teeOverlay = opts.teeOverlayGroups
    ? teeOverlayMapFromGroups(opts.teeOverlayGroups)
    : undefined;

  if (!teeOverlay && opts.loadTeeSheetOverlay !== false) {
    const canonical = await loadCanonicalTeeSheet(opts.eventId, { preserveDraftPlayers: true });
    if (canonical?.groups?.length) {
      teeOverlay = teeOverlayMapFromGroups(
        canonical.groups.map((g) => ({
          groupNumber: g.groupNumber,
          players: g.players.map((p) => ({
            id: p.id,
            handicapIndex: p.handicapIndex,
            playingHandicap: null,
            teeAssignment: null,
            gender: null,
          })),
        })),
      );
    }
  }

  const rows = buildEventAttendeeCsvRows(
    opts.attendeeRows,
    opts.membersById,
    guestsByIdFromList(opts.guests),
    teeOverlay,
  );
  const content = buildEventAttendeeCsvContent(rows);
  const datePart = opts.eventDate?.slice(0, 10) ?? "event";
  const filename = `${safeCsvFilenamePart(opts.eventName)}-attendees-${datePart}.csv`;
  downloadCsvOnWeb(content, filename);
}
