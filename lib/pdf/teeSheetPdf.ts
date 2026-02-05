/**
 * Tee Sheet PDF Generator - ManCo Tool
 *
 * Generates print-ready tee sheets with:
 * - Landscape A4 layout (fits 12+ groups per page)
 * - Header: Society logo (left), event name, date, course, "Tee Sheet"
 * - Subheader: ManCo list + "Produced by The Golf Society Hub"
 * - Competitions section: NTP holes, LD holes
 * - Dense group blocks with columns: Full Name | HI | PH
 * - WHS handicap calculations with gender-based tee selection
 * - Multi-page support with CSS page breaks
 *
 * Uses expo-print HTML -> printToFileAsync and expo-sharing
 * Does NOT use view-shot/screenshot
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

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
import { getLogoForPdf } from "./logoHelper";

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
 * Fetches all required data and generates a print-ready PDF.
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
  const logoUrl = (society as any)?.logo_url || (society as any)?.logoUrl || null;
  const { logoSrc } = await getLogoForPdf(logoUrl);

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

  // Build HTML
  const html = buildTeeSheetHtml({
    societyName: society?.name || "Golf Society",
    logoSrc,
    manCo,
    eventName: event.name || "Event",
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

  // Generate PDF and share
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  console.log("[teeSheetPdf] PDF created at:", uri);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `Tee Sheet - ${event.name}`,
    });
  } else {
    await Print.printAsync({ html });
  }
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
 * Build HTML for tee sheet PDF
 *
 * Landscape A4 layout, dense grouping, fits 12+ groups per page
 */
function buildTeeSheetHtml(options: TeeSheetHtmlOptions): string {
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
        weekday: "long",
        day: "numeric",
        month: "long",
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
  const phNote = hasTeesConfigured ? "" : '<span style="color:#DC2626;font-size:10px;"> (Set tees to calculate PH)</span>';

  // Logo HTML
  const logoHtml = logoSrc
    ? `<img src="${escapeAttribute(logoSrc)}" style="width:48px;height:48px;object-fit:contain;" />`
    : `<div style="width:48px;height:48px;background:#0B6E4F;border-radius:8px;display:flex;align-items:center;justify-content:center;">
         <span style="color:#fff;font-size:18px;font-weight:bold;">${societyName.charAt(0)}</span>
       </div>`;

  // Build group blocks (3 columns layout for dense packing)
  const groupsHtml = groups.map((group, idx) => {
    const playerRows = (group.players as PlayerWithCalcs[]).map((player) => {
      const hiDisplay = formatHandicap(player.handicapIndex, 1);
      const phDisplay = formatHandicap(player.playingHandicap);

      return `<tr>
        <td style="padding:4px 6px;border-bottom:1px solid #E5E7EB;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">${escapeHtml(player.name)}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;color:#6B7280;">${hiDisplay}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;font-weight:600;color:#0B6E4F;">${phDisplay}</td>
      </tr>`;
    }).join("");

    return `
      <div class="group-block">
        <div class="group-header">
          <span>Group ${group.groupNumber}</span>
          ${group.teeTime ? `<span style="font-weight:400;">${group.teeTime}</span>` : ''}
        </div>
        <table class="group-table">
          <thead>
            <tr>
              <th style="text-align:left;">Name</th>
              <th style="width:40px;">HI</th>
              <th style="width:40px;">PH</th>
            </tr>
          </thead>
          <tbody>
            ${playerRows}
          </tbody>
        </table>
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tee Sheet - ${eventName}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      color: #111827;
      background: #fff;
      font-size: 11px;
      line-height: 1.3;
    }
    .page {
      width: 100%;
      max-width: 100%;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-bottom: 10px;
      border-bottom: 2px solid #0B6E4F;
      margin-bottom: 10px;
    }
    .header-text {
      flex: 1;
    }
    .header-text h1 {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 2px 0;
    }
    .header-text .meta {
      font-size: 11px;
      color: #6B7280;
    }
    .header-badge {
      background: #0B6E4F;
      color: #fff;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }

    /* Subheader - ManCo */
    .subheader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: #6B7280;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #E5E7EB;
    }
    .manco-list {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .manco-list span {
      white-space: nowrap;
    }

    /* Competitions */
    .competitions {
      display: flex;
      gap: 24px;
      background: #F0FDF4;
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 12px;
      font-size: 11px;
      border-left: 4px solid #0B6E4F;
    }
    .competitions strong {
      color: #0B6E4F;
    }

    /* Groups grid - 3 columns */
    .groups-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .group-block {
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      overflow: hidden;
      break-inside: avoid;
    }
    .group-header {
      background: #0B6E4F;
      color: #fff;
      padding: 6px 10px;
      font-weight: 600;
      font-size: 11px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .group-table {
      width: 100%;
      border-collapse: collapse;
    }
    .group-table th {
      background: #F9FAFB;
      padding: 4px 6px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #6B7280;
      font-weight: 600;
      text-align: center;
    }
    .group-table td {
      font-size: 11px;
    }

    /* Footer */
    .footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #9CA3AF;
    }

    /* Page break for many groups */
    .page-break {
      page-break-before: always;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      ${logoHtml}
      <div class="header-text">
        <h1>${escapeHtml(eventName)}</h1>
        <div class="meta">
          ${escapeHtml(societyName)} • ${dateStr}${courseName ? ` • ${escapeHtml(courseName)}` : ''}
        </div>
      </div>
      <div class="header-badge">TEE SHEET</div>
    </div>

    <!-- Subheader - ManCo -->
    <div class="subheader">
      <div class="manco-list">
        ${manCoList.map((m) => `<span>${escapeHtml(m)}</span>`).join('')}
      </div>
      <span>Produced by The Golf Society Hub</span>
    </div>

    <!-- Competitions -->
    ${hasCompetitions ? `
    <div class="competitions">
      ${hasNtp ? `<div><strong>Nearest the Pin:</strong> Hole${nearestPinHoles!.length > 1 ? 's' : ''} ${formatHoleNumbers(nearestPinHoles)}</div>` : ''}
      ${hasLd ? `<div><strong>Longest Drive:</strong> Hole${longestDriveHoles!.length > 1 ? 's' : ''} ${formatHoleNumbers(longestDriveHoles)}</div>` : ''}
    </div>
    ` : ''}

    <!-- Tee info if configured -->
    ${hasTeesConfigured ? `
    <div style="font-size:10px;color:#6B7280;margin-bottom:8px;">
      ${teeSettings ? `<span style="margin-right:16px;">Men (${teeName || 'Standard'}): Par ${teeSettings.par}, CR ${teeSettings.courseRating}, Slope ${teeSettings.slopeRating}</span>` : ''}
      ${ladiesTeeSettings ? `<span>Ladies (${ladiesTeeName || 'Standard'}): Par ${ladiesTeeSettings.par}, CR ${ladiesTeeSettings.courseRating}, Slope ${ladiesTeeSettings.slopeRating}</span>` : ''}
    </div>
    ` : `
    <div style="font-size:10px;color:#DC2626;margin-bottom:8px;">
      ⚠️ Course tee settings not configured. Playing Handicaps (PH) cannot be calculated. Edit event to add tee settings.
    </div>
    `}

    <!-- Groups -->
    ${groups.length > 0 ? `
    <div class="groups-grid">
      ${groupsHtml}
    </div>
    ` : `
    <div style="text-align:center;padding:32px;color:#6B7280;">
      No players registered for this event.
    </div>
    `}

    <!-- Footer -->
    <div class="footer">
      <span>${totalPlayers} player${totalPlayers !== 1 ? 's' : ''} • ${groups.length} group${groups.length !== 1 ? 's' : ''}</span>
      <span>Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  </div>
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

// Re-export generateTeeSheetPdf for backward compatibility
export { exportTeeSheetPdf as generateTeeSheetPdf };
