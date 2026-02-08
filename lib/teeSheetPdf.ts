/**
 * Tee Sheet PDF Generator
 *
 * Generates clean, printable tee sheets with:
 * - Event header (society name, event name, date, course, format)
 * - NTP/LD competition holes
 * - Player groups with columns: Full Name | HI | PH
 * - WHS handicap calculations with gender-based tee selection
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { type ManCoDetails } from "./db_supabase/memberRepo";
import {
  calcCourseHandicap,
  calcPlayingHandicap,
  formatHandicap,
  selectTeeByGender,
  type TeeBlock,
  DEFAULT_ALLOWANCE,
} from "./whs";
import {
  groupPlayers,
  formatHoleNumbers,
  type GroupedPlayer,
  type PlayerGroup,
} from "./teeSheetGrouping";
import { imageUrlToBase64DataUri } from "./pdf/imageUtils";
import { assertNoPrintAsync } from "./pdf/exportContract";

export type TeeSheetPlayer = {
  id?: string;
  name: string;
  handicapIndex?: number | null;
  gender?: "male" | "female" | null;
  teeTime?: string | null;
  group?: number | null;
};

export type TeeSheetData = {
  // Society branding
  societyName: string;
  logoUrl?: string | null;
  manCo: ManCoDetails;

  // Event details
  eventName: string;
  eventDate: string | null;
  courseName: string | null;
  teeName?: string | null;
  ladiesTeeName?: string | null;
  format: string | null;

  // Tee settings for handicap calculations (Men's)
  teeSettings?: TeeBlock | null;
  // Women's tee settings (optional, falls back to Men's if not provided)
  ladiesTeeSettings?: TeeBlock | null;
  // Handicap allowance (default 0.95)
  handicapAllowance?: number | null;

  // Competition holes
  nearestPinHoles?: number[] | null;
  longestDriveHoles?: number[] | null;

  // Players
  players: TeeSheetPlayer[];

  // Optional start time for tee times
  startTime?: string | null;
  teeTimeInterval?: number; // Minutes between groups (default 10)

  // If true, players are already grouped (use player.group field)
  preGrouped?: boolean;
};

type PlayerWithCalcs = GroupedPlayer & {
  gender: "male" | "female" | null;
  playingHandicap: number | null;
};

type GroupWithTime = PlayerGroup & { teeTime: string };

function isValidTime(value: string | null | undefined): value is string {
  if (!value) return false;
  const [hoursStr, minutesStr] = value.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  return Number.isFinite(hours) && Number.isFinite(minutes);
}

function buildTeeTime(startTime: string, intervalMinutes: number, index: number): string {
  const [hoursStr, minutesStr] = startTime.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  const baseMinutes = hours * 60 + minutes + intervalMinutes * index;
  const teeHours = Math.floor(baseMinutes / 60) % 24;
  const teeMins = baseMinutes % 60;
  return `${String(teeHours).padStart(2, "0")}:${String(teeMins).padStart(2, "0")}`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Generate HTML for the tee sheet PDF
 */
function generateTeeSheetHTML(data: TeeSheetData, logoDataUri?: string | null): string {
  const {
    societyName,
    eventName,
    eventDate,
    courseName,
    teeName,
    ladiesTeeName,
    format,
    teeSettings,
    ladiesTeeSettings,
    handicapAllowance,
    nearestPinHoles,
    longestDriveHoles,
    players,
    startTime,
    teeTimeInterval = 10,
    preGrouped = false,
  } = data;

  const allowance = handicapAllowance ?? DEFAULT_ALLOWANCE;

  // Format date for display
  const dateStr = eventDate
    ? new Date(eventDate).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Date TBC";

  // Format label
  const formatLabel = format
    ? format.charAt(0).toUpperCase() + format.slice(1).replace(/_/g, " ")
    : "";

  const hasCompetitions =
    (nearestPinHoles && nearestPinHoles.length > 0) ||
    (longestDriveHoles && longestDriveHoles.length > 0);
  const competitionsText = [
    nearestPinHoles && nearestPinHoles.length > 0
      ? `Nearest the Pin: Hole${nearestPinHoles.length > 1 ? "s" : ""} ${formatHoleNumbers(nearestPinHoles)}`
      : null,
    longestDriveHoles && longestDriveHoles.length > 0
      ? `Longest Drive: Hole${longestDriveHoles.length > 1 ? "s" : ""} ${formatHoleNumbers(longestDriveHoles)}`
      : null,
  ]
    .filter(Boolean)
    .join(" • ");

  // Calculate handicaps for each player based on their gender
  const playersWithHandicaps: PlayerWithCalcs[] = players.map((player, idx) => {
    const gender = player.gender ?? null;
    // Select appropriate tee based on gender
    const playerTee = selectTeeByGender(gender, teeSettings, ladiesTeeSettings);
    // Calculate course handicap then playing handicap
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

  // Group players based on preGrouped flag
  let groups: PlayerGroup[];

  if (preGrouped) {
    // Use existing groups from player.group field
    const groupMap = new Map<number, PlayerWithCalcs[]>();
    players.forEach((p, idx) => {
      const groupNum = p.group ?? 1;
      const playerWithCalcs = playersWithHandicaps[idx];
      if (!groupMap.has(groupNum)) {
        groupMap.set(groupNum, []);
      }
      groupMap.get(groupNum)!.push(playerWithCalcs);
    });

    // Convert to PlayerGroup array, sorted by group number
    groups = Array.from(groupMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([groupNumber, groupPlayers]) => ({
        groupNumber,
        players: groupPlayers,
        teeTime: undefined,
      }));
  } else {
    // Auto-group players (sorted by handicap descending)
    groups = groupPlayers(playersWithHandicaps, true);
  }

  const baseStartTime = isValidTime(startTime) ? startTime : "08:00";
  const intervalMinutes =
    Number.isFinite(teeTimeInterval) && teeTimeInterval > 0 ? teeTimeInterval : 8;

  const groupsWithTimes: GroupWithTime[] = groups.map((group, index) => ({
    ...group,
    teeTime: buildTeeTime(baseStartTime, intervalMinutes, index),
  }));

  const pages = chunkArray(groupsWithTimes, 12);

  const teeInfoLines = [
    teeSettings
      ? `Male (${teeName || "Men's"}): Par ${teeSettings.par} • SR ${teeSettings.slopeRating} • CR ${teeSettings.courseRating}`
      : "Male: tee info not set",
    ladiesTeeSettings
      ? `Female (${ladiesTeeName || "Ladies'"}): Par ${ladiesTeeSettings.par} • SR ${ladiesTeeSettings.slopeRating} • CR ${ladiesTeeSettings.courseRating}`
      : "Female: tee info not set",
    `Allowance: ${Math.round(allowance * 100)}%`,
  ];

  const renderGroupTable = (group: GroupWithTime) => {
    const rows = Array.from({ length: 4 }).map((_, idx) => {
      const player = group.players[idx];
      const name = player?.name ?? "&nbsp;";
      const hiDisplay = player ? formatHandicap(player.handicapIndex, 1) : "&nbsp;";
      const phDisplay = player ? formatHandicap(player.playingHandicap) : "&nbsp;";

      return `
        <tr>
          <td>${name}</td>
          <td class="col-hi">${hiDisplay}</td>
          <td class="col-ph">${phDisplay}</td>
        </tr>
      `;
    });

    return `
      <table class="group-table">
        <tr>
          <td class="time-cell" rowspan="5">${group.teeTime}</td>
          <th class="col-name">Name</th>
          <th class="col-hi">HI</th>
          <th class="col-ph">PH</th>
        </tr>
        ${rows.join("")}
      </table>
    `;
  };

  const pagesHTML = pages
    .map((pageGroups, pageIndex) => {
      const leftGroups = pageGroups.slice(0, 6);
      const rightGroups = pageGroups.slice(6, 12);

      const leftHtml = leftGroups.map(renderGroupTable).join("");
      const rightHtml = rightGroups.map(renderGroupTable).join("");

      return `
        <div class="page">
          <div class="header-row">
            <div class="header-left">
              ${logoDataUri ? `<img class="logo" src="${logoDataUri}" />` : `<div class="logo-placeholder">${societyName.slice(0, 2).toUpperCase()}</div>`}
              <div>
                <div class="society-name">${societyName}</div>
                <div class="header-subtitle">Tee Sheet</div>
              </div>
            </div>
            <div class="header-center">
              <div class="event-title">${eventName}</div>
              <div class="event-meta">${dateStr}${courseName ? ` • ${courseName}` : ""}${formatLabel ? ` • ${formatLabel}` : ""}</div>
            </div>
            <div class="header-right">
              <div class="tee-box">
                <div class="tee-title">Tee Information</div>
                ${teeInfoLines.map((line) => `<div class="tee-line">${line}</div>`).join("")}
              </div>
            </div>
          </div>

          <div class="grid">
            <div class="column">${leftHtml || "<div class='empty-column'>No groups</div>"}</div>
            <div class="column">${rightHtml || "<div class='empty-column'> </div>"}</div>
          </div>

          <div class="special-info">
            <div class="special-title">Special Information</div>
            <div class="special-body">${hasCompetitions ? competitionsText : "No competition holes set."}</div>
          </div>

          <div class="footer">
            <div>Produced by The Golf Society Hub</div>
            <div>Page ${pageIndex + 1} of ${pages.length}</div>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Tee Sheet - ${eventName}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @page {
            size: A4 landscape;
            margin: 12mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 0;
            color: #111827;
            background: #fff;
            font-size: 11px;
            line-height: 1.25;
          }
          .page {
            page-break-after: always;
            border: 1px solid #E5E7EB;
            padding: 12px;
            min-height: 100%;
          }
          .page:last-child { page-break-after: auto; }
          .header-row {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            margin-bottom: 10px;
          }
          .header-left {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 240px;
          }
          .logo { width: 40px; height: 40px; object-fit: contain; }
          .logo-placeholder {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            border: 1px solid #E5E7EB;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            color: #0B6E4F;
            background: #F3F4F6;
          }
          .society-name {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #6B7280;
            font-weight: 700;
          }
          .header-subtitle {
            font-size: 10px;
            color: #9CA3AF;
          }
          .header-center { flex: 1; text-align: center; }
          .event-title { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
          .event-meta { font-size: 11px; color: #6B7280; }
          .header-right { width: 300px; }
          .tee-box {
            border: 1px solid #E5E7EB;
            padding: 8px;
            border-radius: 6px;
          }
          .tee-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin-bottom: 4px; font-weight: 700; }
          .tee-line { font-size: 10px; color: #374151; margin-bottom: 2px; }

          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 10px;
          }
          .column {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .group-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #E5E7EB;
          }
          .group-table th,
          .group-table td {
            border-bottom: 1px solid #F3F4F6;
            padding: 3px 4px;
            font-size: 10px;
          }
          .group-table th {
            background: #F9FAFB;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            font-size: 9px;
            color: #6B7280;
            text-align: left;
          }
          .time-cell {
            width: 52px;
            text-align: center;
            font-weight: 700;
            font-size: 11px;
            color: #0B6E4F;
            background: #F3F4F6;
            border-right: 1px solid #E5E7EB;
          }
          .col-name { width: auto; }
          .col-hi, .col-ph { width: 40px; text-align: right; font-family: 'SF Mono', Consolas, monospace; }
          .col-ph { color: #0B6E4F; font-weight: 700; }

          .special-info {
            border-top: 1px solid #E5E7EB;
            padding-top: 6px;
            margin-top: 6px;
          }
          .special-title {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: #6B7280;
            font-weight: 700;
            margin-bottom: 2px;
          }
          .special-body { font-size: 10px; color: #374151; }

          .footer {
            display: flex;
            justify-content: space-between;
            border-top: 1px solid #E5E7EB;
            padding-top: 6px;
            margin-top: 8px;
            font-size: 10px;
            color: #9CA3AF;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        ${pagesHTML || `<div class="page"><p style="text-align:center; color:#6B7280;">No players registered yet.</p></div>`}
      </body>
    </html>
  `;
}

/**
 * Generate and share/print the tee sheet PDF
 *
 * @param data - Tee sheet data including society, event, and players
 * @returns Promise<boolean> - true if successful
 */
export async function generateTeeSheetPdf(data: TeeSheetData): Promise<boolean> {
  try {
    assertNoPrintAsync();
    // Convert remote logo URL to base64 so expo-print can embed it
    const logoDataUri = data.logoUrl
      ? await imageUrlToBase64DataUri(data.logoUrl)
      : null;

    const html = generateTeeSheetHTML(data, logoDataUri);

    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    console.log("[teeSheetPdf] PDF file created at:", uri);

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      throw new Error("Sharing is not available on this device.");
    }

    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `Tee Sheet - ${data.eventName}`,
      UTI: "com.adobe.pdf",
    });

    return true;
  } catch (error: any) {
    console.error("[teeSheetPdf] generateTeeSheetPdf error:", error);
    throw error;
  }
}
