/**
 * Tee Sheet Data Model and HTML Generator
 * 
 * Follows the same pure data model pattern as Season Leaderboard:
 * 1. Build a pure data model first
 * 2. Then render HTML from that model
 * 3. NO inline state access inside HTML template
 */

import type { Course, TeeSet, EventData, MemberData, GuestData } from "./models";
import { getPlayingHandicap, getGuestPlayingHandicap, getEventAllowancePercent } from "./handicap";
import { formatDateDDMMYYYY } from "@/utils/date";

// ============================================================================
// DATA MODEL TYPES
// ============================================================================

/**
 * Player data for tee sheet (pure data, no component state)
 */
export interface TeeSheetPlayer {
  id: string;
  name: string;
  handicapIndex: number | null;
  playingHandicap: number | null;
  sex: "male" | "female";
  isGuest: boolean;
}

/**
 * Tee time group (pure data)
 */
export interface TeeSheetGroup {
  groupNumber: number;
  teeTime: string; // Formatted time string "08:00"
  teeTimeISO: string;
  players: TeeSheetPlayer[];
}

/**
 * ManCo (Management Committee) details
 */
export interface ManCoDetails {
  captain?: string;
  secretary?: string;
  treasurer?: string;
  handicapper?: string;
}

/**
 * Tee information for display
 */
export interface TeeInfo {
  male?: {
    color: string;
    par: number;
    courseRating: number;
    slopeRating: number;
  };
  female?: {
    color: string;
    par: number;
    courseRating: number;
    slopeRating: number;
  };
  allowancePercent: number;
}

/**
 * Complete Tee Sheet data model (pure data, ready for rendering)
 */
export interface TeeSheetDataModel {
  // Header
  societyName: string;
  societyLogoUrl?: string | null;
  eventName: string;
  eventDate: string;
  courseName: string;
  
  // ManCo
  manCo: ManCoDetails;
  
  // Tee info
  teeInfo: TeeInfo;
  
  // Groups
  groups: TeeSheetGroup[];
  
  // Notes and competitions
  notes?: string;
  nearestToPinHoles: number[];
  longestDriveHoles: number[];
  
  // Metadata
  generatedAt: string;
  totalPlayers: number;
}

// ============================================================================
// DATA MODEL BUILDER
// ============================================================================

export interface BuildTeeSheetDataOptions {
  society: { name: string; logoUrl?: string | null } | null;
  event: EventData;
  course: Course | null;
  maleTeeSet: TeeSet | null;
  femaleTeeSet: TeeSet | null;
  members: MemberData[];
  guests: GuestData[];
  teeGroups: Array<{ timeISO: string; players: string[] }>;
  teeSheetNotes?: string;
  nearestToPinHoles?: number[];
  longestDriveHoles?: number[];
}

/**
 * Find ManCo members from the members list
 */
export function getManCoMembers(members: MemberData[]): ManCoDetails {
  const findByRole = (role: string): MemberData | undefined =>
    members.find((m) => m.roles?.some((r) => r.toLowerCase() === role.toLowerCase()));

  const captain = findByRole("captain") || findByRole("admin");
  const secretary = findByRole("secretary");
  const treasurer = findByRole("treasurer");
  const handicapper = findByRole("handicapper");

  return {
    captain: captain?.name,
    secretary: secretary?.name,
    treasurer: treasurer?.name,
    handicapper: handicapper?.name,
  };
}

/**
 * Build a player data object from member or guest
 */
function buildPlayerData(
  playerId: string,
  members: MemberData[],
  guests: GuestData[],
  event: EventData,
  maleTeeSet: TeeSet | null,
  femaleTeeSet: TeeSet | null
): TeeSheetPlayer | null {
  // Try to find as member
  const member = members.find((m) => m.id === playerId);
  if (member) {
    const ph = getPlayingHandicap(member, event, null, maleTeeSet, femaleTeeSet);
    return {
      id: member.id,
      name: member.name || "Unknown",
      handicapIndex: member.handicap ?? null,
      playingHandicap: ph,
      sex: member.sex || "male",
      isGuest: false,
    };
  }

  // Try to find as guest
  const guest = guests.find((g) => g.id === playerId && g.included);
  if (guest) {
    const ph = getGuestPlayingHandicap(guest, event, maleTeeSet, femaleTeeSet);
    return {
      id: guest.id,
      name: `${guest.name} (Guest)`,
      handicapIndex: guest.handicapIndex ?? null,
      playingHandicap: ph,
      sex: guest.sex,
      isGuest: true,
    };
  }

  return null;
}

/**
 * Build complete tee sheet data model from raw inputs
 * This is a PURE function - no side effects, no state access
 */
export function buildTeeSheetDataModel(options: BuildTeeSheetDataOptions): TeeSheetDataModel {
  const {
    society,
    event,
    course,
    maleTeeSet,
    femaleTeeSet,
    members,
    guests,
    teeGroups,
    teeSheetNotes,
    nearestToPinHoles,
    longestDriveHoles,
  } = options;

  // Build groups with validated players
  const groups: TeeSheetGroup[] = teeGroups.map((group, idx) => {
    const teeTime = new Date(group.timeISO).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const players: TeeSheetPlayer[] = group.players
      .map((playerId) => buildPlayerData(playerId, members, guests, event, maleTeeSet, femaleTeeSet))
      .filter((p): p is TeeSheetPlayer => p !== null);

    return {
      groupNumber: idx + 1,
      teeTime,
      teeTimeISO: group.timeISO,
      players,
    };
  });

  // Calculate total players
  const totalPlayers = groups.reduce((sum, g) => sum + g.players.length, 0);

  // Build tee info
  const teeInfo: TeeInfo = {
    allowancePercent: getEventAllowancePercent(event),
  };

  if (maleTeeSet) {
    teeInfo.male = {
      color: maleTeeSet.teeColor,
      par: maleTeeSet.par,
      courseRating: maleTeeSet.courseRating,
      slopeRating: maleTeeSet.slopeRating,
    };
  }

  if (femaleTeeSet) {
    teeInfo.female = {
      color: femaleTeeSet.teeColor,
      par: femaleTeeSet.par,
      courseRating: femaleTeeSet.courseRating,
      slopeRating: femaleTeeSet.slopeRating,
    };
  }

  return {
    societyName: society?.name || "Golf Society",
    societyLogoUrl: society?.logoUrl,
    eventName: event?.name || "Tee Sheet",
    eventDate: event?.date ? formatDateDDMMYYYY(event.date) : "Date TBD",
    courseName: course?.name || event?.courseName || "Course TBD",
    manCo: getManCoMembers(members),
    teeInfo,
    groups,
    notes: teeSheetNotes?.trim() || undefined,
    nearestToPinHoles: nearestToPinHoles || [],
    longestDriveHoles: longestDriveHoles || [],
    generatedAt: new Date().toISOString(),
    totalPlayers,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface TeeSheetValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate tee sheet data model before export
 */
export function validateTeeSheetData(data: TeeSheetDataModel): TeeSheetValidationResult {
  const errors: string[] = [];

  if (!data.eventName) {
    errors.push("Event name is required");
  }

  if (data.groups.length === 0) {
    errors.push("No tee groups found");
  }

  if (data.totalPlayers === 0) {
    errors.push("No players in tee sheet");
  }

  // Check for groups with all invalid players (empty after filtering)
  const emptyGroups = data.groups.filter((g) => g.players.length === 0);
  if (emptyGroups.length > 0) {
    errors.push(`${emptyGroups.length} group(s) have no valid players`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// HTML RENDERER
// ============================================================================

/**
 * Render tee sheet HTML from data model
 * This is a PURE function - takes data model, returns HTML string
 */
export function renderTeeSheetHtml(data: TeeSheetDataModel): string {
  // Build ManCo line
  const manCoEntries: string[] = [];
  if (data.manCo.captain) manCoEntries.push(`Captain: ${data.manCo.captain}`);
  if (data.manCo.secretary) manCoEntries.push(`Secretary: ${data.manCo.secretary}`);
  if (data.manCo.treasurer) manCoEntries.push(`Treasurer: ${data.manCo.treasurer}`);
  if (data.manCo.handicapper) manCoEntries.push(`Handicapper: ${data.manCo.handicapper}`);

  const logoHtml = data.societyLogoUrl
    ? `<img src="${data.societyLogoUrl}" alt="Society Logo" style="max-width: 80px; max-height: 80px; margin-bottom: 10px;" onerror="this.style.display='none'" />`
    : "";

  // Build tee groups HTML
  const groupsHtml = data.groups
    .map((group) => {
      if (group.players.length === 0) {
        return `<tr>
          <td class="time-col">${group.teeTime}</td>
          <td class="group-col">${group.groupNumber}</td>
          <td colspan="3" class="empty-group">Empty group</td>
        </tr>`;
      }

      return group.players
        .map((player, playerIdx) => `
          <tr>
            ${playerIdx === 0 ? `<td class="time-col" rowspan="${group.players.length}">${group.teeTime}</td>` : ""}
            ${playerIdx === 0 ? `<td class="group-col" rowspan="${group.players.length}">${group.groupNumber}</td>` : ""}
            <td class="name-col">${player.name}</td>
            <td class="hi-col">${player.handicapIndex !== null ? player.handicapIndex : "-"}</td>
            <td class="ph-col"><strong>${player.playingHandicap !== null ? player.playingHandicap : "-"}</strong></td>
          </tr>
        `)
        .join("");
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tee Sheet - ${data.eventName}</title>
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: Arial, Helvetica, sans-serif; 
      font-size: 11px; 
      padding: 15px; 
      margin: 0;
      line-height: 1.4;
    }
    .no-print { margin-bottom: 15px; }
    .top-header { 
      display: flex; 
      justify-content: space-between; 
      align-items: flex-start; 
      margin-bottom: 15px;
      border-bottom: 2px solid #0B6E4F;
      padding-bottom: 10px;
    }
    .logo-container { flex-shrink: 0; width: 100px; }
    .header { flex: 1; text-align: center; padding: 0 15px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: bold; color: #0B6E4F; }
    .header .event-details { margin: 8px 0; font-size: 13px; color: #333; }
    .manco { margin-top: 8px; font-size: 10px; color: #555; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
    .manco span { white-space: nowrap; }
    .produced-by { font-size: 9px; color: #888; margin-top: 8px; }
    .tee-info { 
      width: 220px; 
      border: 1px solid #0B6E4F; 
      border-radius: 6px;
      padding: 10px; 
      font-size: 10px;
      background: #f9fafb;
    }
    .tee-info h3 { margin: 0 0 8px 0; font-size: 12px; color: #0B6E4F; border-bottom: 1px solid #0B6E4F; padding-bottom: 4px; }
    .tee-info p { margin: 4px 0; }
    .notes-box {
      margin: 12px 0;
      padding: 10px 12px;
      background-color: #f0fdf4;
      border-left: 4px solid #0B6E4F;
      border-radius: 0 6px 6px 0;
    }
    .notes-box strong { color: #0B6E4F; }
    .competitions-box {
      margin: 12px 0;
      padding: 10px 12px;
      background-color: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 6px;
    }
    .competitions-box p { margin: 3px 0; }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-top: 12px; 
      font-size: 10px; 
    }
    th, td { border: 1px solid #333; padding: 5px 6px; text-align: left; }
    th { background-color: #0B6E4F; color: white; font-weight: bold; }
    .time-col { width: 55px; text-align: center; }
    .group-col { width: 45px; text-align: center; }
    .name-col { min-width: 140px; }
    .hi-col { width: 45px; text-align: center; }
    .ph-col { width: 45px; text-align: center; font-weight: bold; }
    .empty-group { font-style: italic; color: #666; }
    tr:nth-child(even) { background-color: #f9fafb; }
    @media print { 
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; }
      .no-print { display: none !important; }
    }
    @page { size: A4; margin: 10mm; }
  </style>
</head>
<body>
  <div class="top-header">
    <div class="logo-container">${logoHtml}</div>
    <div class="header">
      <h1>${data.eventName}</h1>
      <div class="event-details">${data.eventDate} — ${data.courseName}</div>
      ${manCoEntries.length > 0 ? `<div class="manco">${manCoEntries.map((e) => `<span>${e}</span>`).join("")}</div>` : ""}
      <div class="produced-by">Produced by The Golf Society Hub</div>
    </div>
    <div class="tee-info">
      <h3>Tee Information</h3>
      ${data.teeInfo.male ? `<p><strong>Male:</strong> ${data.teeInfo.male.color}<br>Par ${data.teeInfo.male.par} | CR ${data.teeInfo.male.courseRating} | SR ${data.teeInfo.male.slopeRating}</p>` : ""}
      ${data.teeInfo.female ? `<p><strong>Female:</strong> ${data.teeInfo.female.color}<br>Par ${data.teeInfo.female.par} | CR ${data.teeInfo.female.courseRating} | SR ${data.teeInfo.female.slopeRating}</p>` : ""}
      <p><strong>Allowance:</strong> ${data.teeInfo.allowancePercent}%</p>
    </div>
  </div>
  ${data.notes ? `
  <div class="notes-box">
    <p style="margin: 0;"><strong>Notes:</strong></p>
    <p style="margin: 4px 0 0 0; white-space: pre-wrap;">${data.notes.replace(/\n/g, "<br>")}</p>
  </div>` : ""}
  ${data.nearestToPinHoles.length > 0 || data.longestDriveHoles.length > 0 ? `
  <div class="competitions-box">
    ${data.nearestToPinHoles.length > 0 ? `<p><strong>Nearest to Pin:</strong> Hole ${data.nearestToPinHoles.join(", Hole ")}</p>` : ""}
    ${data.longestDriveHoles.length > 0 ? `<p><strong>Longest Drive:</strong> Hole ${data.longestDriveHoles.join(", Hole ")}</p>` : ""}
  </div>` : ""}
  <table>
    <thead>
      <tr>
        <th class="time-col">Time</th>
        <th class="group-col">Group</th>
        <th class="name-col">Player Name</th>
        <th class="hi-col">HI</th>
        <th class="ph-col">PH</th>
      </tr>
    </thead>
    <tbody>${groupsHtml}</tbody>
  </table>
</body>
</html>`;
}

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

/**
 * Legacy interface for backward compatibility
 */
export interface TeeSheetPrintOptions {
  society: { name: string; logoUrl?: string | null } | null;
  event: EventData;
  course: Course | null;
  maleTeeSet: TeeSet | null;
  femaleTeeSet: TeeSet | null;
  members: MemberData[];
  guests: Array<{ id: string; name: string; sex: "male" | "female"; handicapIndex?: number }>;
  teeGroups: Array<{ timeISO: string; players: string[] }>;
  teeSheetNotes: string;
  nearestToPinHoles: number[];
  longestDriveHoles: number[];
  handicapAllowancePct: number;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use buildTeeSheetDataModel + renderTeeSheetHtml instead
 */
export function generateTeeSheetHtml(options: TeeSheetPrintOptions): string {
  const guests: GuestData[] = options.guests.map((g) => ({
    ...g,
    included: true,
  }));

  const dataModel = buildTeeSheetDataModel({
    society: options.society,
    event: options.event,
    course: options.course,
    maleTeeSet: options.maleTeeSet,
    femaleTeeSet: options.femaleTeeSet,
    members: options.members,
    guests,
    teeGroups: options.teeGroups,
    teeSheetNotes: options.teeSheetNotes,
    nearestToPinHoles: options.nearestToPinHoles,
    longestDriveHoles: options.longestDriveHoles,
  });

  return renderTeeSheetHtml(dataModel);
}
