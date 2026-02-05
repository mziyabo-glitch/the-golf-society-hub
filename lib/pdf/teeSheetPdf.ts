/**
 * Tee Sheet PDF Generator - ManCo Tool
 *
 * IMPORTANT: This generates a REAL PDF from HTML template.
 * Do NOT use Print.printAsync for PDF exports - it prints the UI screen.
 * Always use the centralized exportPdf() function.
 *
 * Features:
 * - Landscape A4 layout (fits 12+ groups per page)
 * - Header: Society logo (left), event name, date, course, "Tee Sheet"
 * - Subheader: ManCo list + "Produced by The Golf Society Hub"
 * - Competitions section: NTP holes, LD holes
 * - Dense group blocks with columns: Full Name | HI | PH
 * - WHS handicap calculations with gender-based tee selection
 * - Multi-page support with CSS page breaks (12 groups per page)
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

// Maximum groups per page for landscape A4
const GROUPS_PER_PAGE = 12;

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

  // Use centralized export function - never printAsync
  // Landscape A4 dimensions in points (1 point = 1/72 inch): 842 x 595
  await exportPdf({
    html,
    filename: `Tee Sheet - ${eventName}`,
    width: 842,
    height: 595,
  });
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
 * This generates a standalone HTML document with:
 * - NO app UI elements (tabs, buttons, headers)
 * - Landscape A4 layout via @page CSS
 * - 2-column grid for groups (fits 12 per page)
 * - Page breaks after every 12 groups
 * - Embedded logo as base64 data URI
 */
export function buildTeeSheetHtml(options: TeeSheetHtmlOptions): string {
  const {
    societyName,
    logoSrc,
    manCo,
    eventName,
    eventDate,
    courseName,
    teeName,
    ladiesTeeName,
    teeSettings,
    ladiesTeeSettings,
    nearestPinHoles,
    longestDriveHoles,
    groups,
    totalPlayers,
  } = options;

  // Format date
  const dateStr = eventDate
    ? new Date(eventDate).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date TBC";

  // Build ManCo list
  const manCoList: string[] = [];
  if (manCo.captain) manCoList.push(`Captain: ${manCo.captain}`);
  if (manCo.secretary) manCoList.push(`Secretary: ${manCo.secretary}`);
  if (manCo.treasurer) manCoList.push(`Treasurer: ${manCo.treasurer}`);
  if (manCo.handicapper) manCoList.push(`Handicapper: ${manCo.handicapper}`);

  // Build competitions info
  const hasNtp = nearestPinHoles && nearestPinHoles.length > 0;
  const hasLd = longestDriveHoles && longestDriveHoles.length > 0;
  const hasCompetitions = hasNtp || hasLd;

  // Check if tee settings are configured
  const hasTeesConfigured = teeSettings || ladiesTeeSettings;

  // Logo HTML - use base64 data URI for reliable embedding
  const logoHtml = logoSrc
    ? `<img src="${escapeAttribute(logoSrc)}" class="logo" />`
    : `<div class="logo-placeholder">${societyName.charAt(0).toUpperCase()}</div>`;

  // Split groups into pages (12 groups per page max)
  const pages: GroupWithTime[][] = [];
  for (let i = 0; i < groups.length; i += GROUPS_PER_PAGE) {
    pages.push(groups.slice(i, i + GROUPS_PER_PAGE));
  }

  // Build page HTML for each page
  const pagesHtml = pages.map((pageGroups, pageIdx) => {
    const groupsHtml = pageGroups.map((group) => {
      const playerRows = (group.players as PlayerWithCalcs[]).map((player) => {
        const hiDisplay = formatHandicap(player.handicapIndex, 1);
        const phDisplay = formatHandicap(player.playingHandicap);

        return `<tr>
          <td class="name-cell">${escapeHtml(player.name)}</td>
          <td class="num-cell">${hiDisplay}</td>
          <td class="num-cell ph-cell">${phDisplay}</td>
        </tr>`;
      }).join("");

      return `
        <div class="group-card">
          <div class="group-header">
            <span class="group-num">Group ${group.groupNumber}</span>
            ${group.teeTime ? `<span class="tee-time">${group.teeTime}</span>` : ''}
          </div>
          <table class="group-table">
            <thead>
              <tr>
                <th class="th-name">Name</th>
                <th class="th-num">HI</th>
                <th class="th-num">PH</th>
              </tr>
            </thead>
            <tbody>
              ${playerRows}
            </tbody>
          </table>
        </div>
      `;
    }).join("");

    const isLastPage = pageIdx === pages.length - 1;

    return `
      <div class="page${!isLastPage ? ' page-break' : ''}">
        <!-- Header (repeated on each page) -->
        <div class="header">
          ${logoHtml}
          <div class="header-text">
            <h1>${escapeHtml(eventName)}</h1>
            <div class="meta">${escapeHtml(societyName)} • ${dateStr}${courseName ? ` • ${escapeHtml(courseName)}` : ''}</div>
          </div>
          <div class="header-badge">TEE SHEET</div>
        </div>

        <!-- Subheader - ManCo -->
        <div class="subheader">
          <div class="manco-list">${manCoList.map((m) => `<span>${escapeHtml(m)}</span>`).join('')}</div>
          <span class="branding">Produced by The Golf Society Hub</span>
        </div>

        ${pageIdx === 0 ? `
        <!-- Competitions (first page only) -->
        ${hasCompetitions ? `
        <div class="competitions">
          ${hasNtp ? `<div><strong>NTP:</strong> Hole${nearestPinHoles!.length > 1 ? 's' : ''} ${formatHoleNumbers(nearestPinHoles)}</div>` : ''}
          ${hasLd ? `<div><strong>LD:</strong> Hole${longestDriveHoles!.length > 1 ? 's' : ''} ${formatHoleNumbers(longestDriveHoles)}</div>` : ''}
        </div>
        ` : ''}

        <!-- Tee info -->
        ${hasTeesConfigured ? `
        <div class="tee-info">
          ${teeSettings ? `<span>Men (${teeName || 'Std'}): Par ${teeSettings.par}, CR ${teeSettings.courseRating}, Slope ${teeSettings.slopeRating}</span>` : ''}
          ${ladiesTeeSettings ? `<span>Ladies (${ladiesTeeName || 'Std'}): Par ${ladiesTeeSettings.par}, CR ${ladiesTeeSettings.courseRating}, Slope ${ladiesTeeSettings.slopeRating}</span>` : ''}
        </div>
        ` : `
        <div class="tee-warning">⚠ Tee settings not configured - PH cannot be calculated</div>
        `}
        ` : ''}

        <!-- Groups Grid -->
        <div class="groups-grid">
          ${groupsHtml}
        </div>

        <!-- Footer -->
        <div class="footer">
          <span>${totalPlayers} player${totalPlayers !== 1 ? 's' : ''} • ${groups.length} group${groups.length !== 1 ? 's' : ''}${pages.length > 1 ? ` • Page ${pageIdx + 1}/${pages.length}` : ''}</span>
          <span>Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tee Sheet - ${escapeHtml(eventName)}</title>
  <style>
    /* Landscape A4 page setup */
    @page {
      size: A4 landscape;
      margin: 12mm;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      color: #111827;
      background: #fff;
      font-size: 10px;
      line-height: 1.2;
    }

    /* Page container */
    .page {
      width: 100%;
      min-height: 100%;
    }
    .page-break {
      page-break-after: always;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #0B6E4F;
      margin-bottom: 8px;
    }
    .logo {
      width: 40px;
      height: 40px;
      object-fit: contain;
    }
    .logo-placeholder {
      width: 40px;
      height: 40px;
      background: #0B6E4F;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 18px;
      font-weight: bold;
    }
    .header-text {
      flex: 1;
    }
    .header-text h1 {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      margin: 0;
    }
    .header-text .meta {
      font-size: 10px;
      color: #6B7280;
      margin-top: 2px;
    }
    .header-badge {
      background: #0B6E4F;
      color: #fff;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }

    /* Subheader - ManCo */
    .subheader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #6B7280;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #E5E7EB;
    }
    .manco-list {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .branding {
      font-style: italic;
    }

    /* Competitions */
    .competitions {
      display: flex;
      gap: 20px;
      background: #F0FDF4;
      padding: 6px 10px;
      border-radius: 4px;
      margin-bottom: 8px;
      font-size: 10px;
      border-left: 3px solid #0B6E4F;
    }
    .competitions strong {
      color: #0B6E4F;
    }

    /* Tee info */
    .tee-info {
      font-size: 9px;
      color: #6B7280;
      margin-bottom: 8px;
      display: flex;
      gap: 16px;
    }
    .tee-warning {
      font-size: 9px;
      color: #DC2626;
      margin-bottom: 8px;
    }

    /* Groups grid - 2 columns for 12 groups per page */
    .groups-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    /* Group card */
    .group-card {
      border: 1px solid #D1D5DB;
      border-radius: 4px;
      overflow: hidden;
      break-inside: avoid;
    }
    .group-header {
      background: #0B6E4F;
      color: #fff;
      padding: 4px 8px;
      font-size: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .group-num {
      font-weight: 600;
    }
    .tee-time {
      font-weight: 400;
      opacity: 0.9;
    }

    /* Group table */
    .group-table {
      width: 100%;
      border-collapse: collapse;
    }
    .group-table th {
      background: #F9FAFB;
      padding: 3px 6px;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #6B7280;
      font-weight: 600;
      border-bottom: 1px solid #E5E7EB;
    }
    .th-name {
      text-align: left;
    }
    .th-num {
      text-align: center;
      width: 32px;
    }
    .group-table td {
      padding: 3px 6px;
      font-size: 10px;
      border-bottom: 1px solid #F3F4F6;
    }
    .name-cell {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }
    .num-cell {
      text-align: center;
      color: #6B7280;
      width: 32px;
    }
    .ph-cell {
      font-weight: 600;
      color: #0B6E4F;
    }
    .group-table tr:last-child td {
      border-bottom: none;
    }

    /* Footer */
    .footer {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #9CA3AF;
    }

    /* Print styles */
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  ${groups.length > 0 ? pagesHtml : `
  <div class="page">
    <div class="header">
      ${logoHtml}
      <div class="header-text">
        <h1>${escapeHtml(eventName)}</h1>
        <div class="meta">${escapeHtml(societyName)} • ${dateStr}</div>
      </div>
      <div class="header-badge">TEE SHEET</div>
    </div>
    <div style="text-align:center;padding:40px;color:#6B7280;">
      No players registered for this event.
    </div>
  </div>
  `}
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
