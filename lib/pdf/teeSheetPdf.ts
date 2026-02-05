/**
 * Tee Sheet PDF Generator - ManCo Tool
 *
 * IMPORTANT: This generates a REAL PDF from HTML template.
 * Do NOT use Print.printAsync for PDF exports - it prints the UI screen.
 * Always use the centralized exportPdf() function.
 *
 * Features:
 * - Portrait A4 layout (clean single-column table)
 * - Header: Event name, date, venue
 * - ManCo list + "Produced by The Golf Society Hub"
 * - Tee Information box (course ratings)
 * - Simple table: Time | Group | Player Name | HI | PH
 * - WHS handicap calculations with gender-based tee selection
 *
 * Uses centralized exportPdf() - never calls Print.printAsync
 */

import { type ManCoDetails, getManCoRoleHolders } from "@/lib/db_supabase/memberRepo";
import { getSociety } from "@/lib/db_supabase/societyRepo";
import { getEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import {
  calcCourseHandicap,
  calcPlayingHandicap,
  formatHandicap,
  selectTeeByGender,
  type TeeBlock,
  DEFAULT_ALLOWANCE,
} from "@/lib/whs";
import {
  groupPlayers,
  calculateGroupSizes,
  formatHoleNumbers,
  type GroupedPlayer,
  type PlayerGroup,
} from "@/lib/teeSheetGrouping";
import { exportPdf, getLogoDataUri } from "./exportPdf";

export type TeeSheetPlayer = {
  id?: string;
  name: string;
  handicapIndex?: number | null;
  gender?: "male" | "female" | null;
  groupIndex?: number;
};

export type TeeSheetOptions = {
  eventId: string;
  societyId: string;
  startTime?: string | null;
  teeTimeInterval?: number; // Minutes between groups (default 10)
  preGroupedPlayers?: TeeSheetPlayer[] | null; // If provided, use these groups
};

type PlayerWithCalcs = GroupedPlayer & {
  gender: "male" | "female" | null;
  playingHandicap: number | null;
};

type GroupWithTime = PlayerGroup & {
  teeTime?: string | null;
};


/**
 * Generate and share tee sheet PDF
 *
 * Main entry point for ManCo tee sheet generation.
 * Fetches all required data and generates a print-ready PDF FILE (not screen print).
 */
export async function exportTeeSheetPdf(options: TeeSheetOptions): Promise<void> {
  const { eventId, societyId, startTime, teeTimeInterval = 10, preGroupedPlayers } = options;

  if (!eventId || !societyId) {
    throw new Error("Missing event ID or society ID");
  }

  console.log("[teeSheetPdf] exportTeeSheetPdf starting:", { eventId, societyId });

  // Fetch all required data in parallel
  const [society, event, members, manCo] = await Promise.all([
    getSociety(societyId),
    getEvent(eventId),
    getMembersBySocietyId(societyId),
    getManCoRoleHolders(societyId),
  ]);

  if (!event) {
    throw new Error("Event not found");
  }

  // Get logo as base64 for reliable PDF embedding
  // If fetch fails, logoSrc will be null and we'll show initials instead
  const logoUrl = (society as any)?.logo_url || (society as any)?.logoUrl || null;
  const { logoSrc } = await getLogoDataUri(logoUrl);

  // Build tee settings for handicap calculations
  const menTee: TeeBlock | null =
    event.par != null && event.courseRating != null && event.slopeRating != null
      ? { par: event.par, courseRating: event.courseRating, slopeRating: event.slopeRating }
      : null;
  const ladiesTee: TeeBlock | null =
    event.ladiesPar != null && event.ladiesCourseRating != null && event.ladiesSlopeRating != null
      ? { par: event.ladiesPar, courseRating: event.ladiesCourseRating, slopeRating: event.ladiesSlopeRating }
      : null;
  const allowance = event.handicapAllowance ?? DEFAULT_ALLOWANCE;

  // Get players for this event
  let playersToUse: TeeSheetPlayer[];

  if (preGroupedPlayers && preGroupedPlayers.length > 0) {
    playersToUse = preGroupedPlayers;
  } else {
    const playerIds = event.playerIds || [];
    const eventMembers = members.filter((m) => playerIds.includes(m.id));
    playersToUse = eventMembers.map((m) => ({
      id: m.id,
      name: m.name || m.displayName || "Member",
      handicapIndex: m.handicapIndex ?? m.handicap_index ?? null,
      gender: m.gender ?? null,
    }));
  }

  // Calculate handicaps and create groups
  const playersWithHandicaps: PlayerWithCalcs[] = playersToUse.map((player, idx) => {
    const gender = player.gender ?? null;
    const playerTee = selectTeeByGender(gender, menTee, ladiesTee);
    const courseHandicap = calcCourseHandicap(player.handicapIndex, playerTee);
    const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);

    return {
      id: player.id || String(idx),
      name: player.name,
      handicapIndex: player.handicapIndex ?? null,
      courseHandicap,
      playingHandicap,
      gender,
    };
  });

  // Group players
  let groups: PlayerGroup[];

  if (preGroupedPlayers && preGroupedPlayers.some((p) => p.groupIndex != null)) {
    // Use pre-defined groups
    const groupMap = new Map<number, PlayerWithCalcs[]>();
    playersToUse.forEach((p, idx) => {
      const groupNum = p.groupIndex ?? 0;
      if (!groupMap.has(groupNum)) {
        groupMap.set(groupNum, []);
      }
      groupMap.get(groupNum)!.push(playersWithHandicaps[idx]);
    });

    groups = Array.from(groupMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([groupNumber, players]) => ({
        groupNumber: groupNumber + 1,
        players,
        teeTime: null,
      }));
  } else {
    // Auto-group sorted by handicap (high to low)
    groups = groupPlayers(playersWithHandicaps, true);
  }

  // Assign tee times
  let groupsWithTimes: GroupWithTime[] = groups;
  if (startTime) {
    const [hours, minutes] = startTime.split(":").map(Number);
    if (!isNaN(hours) && !isNaN(minutes)) {
      let currentMinutes = hours * 60 + minutes;
      groupsWithTimes = groups.map((group) => {
        const teeHours = Math.floor(currentMinutes / 60);
        const teeMins = currentMinutes % 60;
        const teeTime = `${String(teeHours).padStart(2, "0")}:${String(teeMins).padStart(2, "0")}`;
        currentMinutes += teeTimeInterval;
        return { ...group, teeTime };
      });
    }
  }

  // Build HTML template (contains ONLY tee sheet content, no app UI)
  const eventName = event.name || "Event";
  
  console.log("[teeSheetPdf] Building HTML template with", groupsWithTimes.length, "groups");
  
  const html = buildTeeSheetHtml({
    societyName: society?.name || "Golf Society",
    logoSrc,
    manCo,
    eventName,
    eventDate: event.date || null,
    courseName: event.courseName || null,
    teeName: event.teeName || null,
    ladiesTeeName: event.ladiesTeeName || null,
    teeSettings: menTee,
    ladiesTeeSettings: ladiesTee,
    nearestPinHoles: event.nearestPinHoles || null,
    longestDriveHoles: event.longestDriveHoles || null,
    groups: groupsWithTimes,
    totalPlayers: playersToUse.length,
  });

  // Verify HTML starts with DOCTYPE (not app content)
  if (!html.startsWith("<!DOCTYPE")) {
    console.error("[teeSheetPdf] ERROR: HTML does not start with DOCTYPE!");
    console.error("[teeSheetPdf] HTML starts with:", html.substring(0, 100));
    throw new Error("Invalid HTML template generated");
  }
  
  console.log("[teeSheetPdf] HTML template built, length:", html.length);
  console.log("[teeSheetPdf] Calling exportPdf with landscape A4 (842x595)");

  // Use centralized export function - never printAsync
  // Portrait A4 (default dimensions)
  await exportPdf({
    html,
    filename: `Tee Sheet - ${eventName}`,
  });
  
  console.log("[teeSheetPdf] Export complete");
}

type TeeSheetHtmlOptions = {
  societyName: string;
  logoSrc: string | null;
  manCo: ManCoDetails;
  eventName: string;
  eventDate: string | null;
  courseName: string | null;
  teeName: string | null;
  ladiesTeeName: string | null;
  teeSettings: TeeBlock | null;
  ladiesTeeSettings: TeeBlock | null;
  nearestPinHoles: number[] | null;
  longestDriveHoles: number[] | null;
  groups: GroupWithTime[];
  totalPlayers: number;
};

/**
 * Build HTML template for tee sheet PDF
 *
 * This generates a standalone HTML document matching the clean portrait layout:
 * - NO app UI elements
 * - Portrait A4 layout
 * - Header: Event name, date | venue
 * - ManCo list centered
 * - Tee Information box
 * - Single table: Time | Group | Player Name | HI | PH
 */
export function buildTeeSheetHtml(options: TeeSheetHtmlOptions): string {
  const {
    societyName,
    manCo,
    eventName,
    eventDate,
    courseName,
    teeName,
    ladiesTeeName,
    teeSettings,
    ladiesTeeSettings,
    groups,
  } = options;

  // Format date as YYYY-MM-DD
  const dateStr = eventDate
    ? new Date(eventDate).toISOString().split("T")[0]
    : "Date TBC";

  // Build ManCo lines
  const manCoLines: string[] = [];
  if (manCo.captain) manCoLines.push(`Captain: ${manCo.captain}`);
  if (manCo.secretary) manCoLines.push(`Secretary: ${manCo.secretary}`);
  if (manCo.treasurer) manCoLines.push(`Treasurer: ${manCo.treasurer}`);
  if (manCo.handicapper) manCoLines.push(`Handicapper: ${manCo.handicapper}`);

  // Build tee information
  const hasTeeInfo = teeSettings || ladiesTeeSettings;

  // Build table rows - each player is a row, group/time shown on first player only
  let tableRows = "";
  groups.forEach((group) => {
    const players = group.players as PlayerWithCalcs[];
    players.forEach((player, playerIdx) => {
      const isFirstInGroup = playerIdx === 0;
      const rowspan = players.length;
      
      const hiDisplay = formatHandicap(player.handicapIndex, 1);
      const phDisplay = formatHandicap(player.playingHandicap);

      tableRows += `<tr>`;
      if (isFirstInGroup) {
        tableRows += `<td class="time-cell" rowspan="${rowspan}">${group.teeTime || ""}</td>`;
        tableRows += `<td class="group-cell" rowspan="${rowspan}">${group.groupNumber}</td>`;
      }
      tableRows += `<td class="name-cell">${escapeHtml(player.name)}</td>`;
      tableRows += `<td class="num-cell">${hiDisplay}</td>`;
      tableRows += `<td class="num-cell">${phDisplay}</td>`;
      tableRows += `</tr>`;
    });
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tee Sheet - ${escapeHtml(eventName)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      color: #111;
      background: #fff;
      font-size: 11px;
      line-height: 1.3;
      padding: 20px;
    }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: 12px;
    }
    .event-name {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .event-meta {
      font-size: 12px;
      color: #444;
    }

    /* ManCo */
    .manco {
      text-align: center;
      font-size: 10px;
      color: #333;
      margin-bottom: 8px;
    }
    .manco div {
      margin: 2px 0;
    }

    /* Branding + Tee Info row */
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      font-size: 10px;
    }
    .branding {
      color: #666;
      font-style: italic;
    }
    .tee-info-box {
      border: 1px solid #ccc;
      padding: 8px 12px;
      font-size: 9px;
      line-height: 1.4;
    }
    .tee-info-box strong {
      display: block;
      margin-bottom: 4px;
      font-size: 10px;
    }
    .tee-info-box div {
      margin: 2px 0;
    }

    /* Main table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    thead tr {
      background: #0B6E4F;
      color: #fff;
    }
    th {
      padding: 8px 6px;
      text-align: left;
      font-weight: 600;
      border: 1px solid #0B6E4F;
    }
    th.num-col {
      text-align: center;
      width: 50px;
    }
    td {
      padding: 6px;
      border: 1px solid #ddd;
      vertical-align: middle;
    }
    .time-cell {
      width: 50px;
      text-align: center;
      font-weight: 500;
      background: #f9f9f9;
    }
    .group-cell {
      width: 50px;
      text-align: center;
      font-weight: 600;
      background: #f9f9f9;
    }
    .name-cell {
      /* auto width */
    }
    .num-cell {
      width: 50px;
      text-align: center;
    }

    /* Print */
    @media print {
      body { padding: 0; }
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="event-name">${escapeHtml(eventName)}</div>
    <div class="event-meta">${dateStr}${courseName ? ` | ${escapeHtml(courseName)}` : ""}</div>
  </div>

  <div class="manco">
    ${manCoLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
  </div>

  <div class="info-row">
    <div class="branding">Produced by The Golf Society Hub</div>
    ${hasTeeInfo ? `
    <div class="tee-info-box">
      <strong>Tee Information</strong>
      ${teeSettings ? `<div>Male: ${teeName || "Yellow"}<br>Par: ${teeSettings.par} | CR: ${teeSettings.courseRating} | SR: ${teeSettings.slopeRating}</div>` : ""}
      ${ladiesTeeSettings ? `<div>Female: ${ladiesTeeName || "Red"}<br>Par: ${ladiesTeeSettings.par} | CR: ${ladiesTeeSettings.courseRating} | SR: ${ladiesTeeSettings.slopeRating}</div>` : ""}
      ${teeSettings || ladiesTeeSettings ? `<div>Allowance: 95%</div>` : ""}
    </div>
    ` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th class="num-col">Time</th>
        <th class="num-col">Group</th>
        <th>Player Name</th>
        <th class="num-col">HI</th>
        <th class="num-col">PH</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || `<tr><td colspan="5" style="text-align:center;padding:20px;color:#666;">No players registered</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(input: string): string {
  return escapeHtml(input).replace(/"/g, "&quot;");
}

// Re-export for backward compatibility
export { exportTeeSheetPdf as generateTeeSheetPdf };
