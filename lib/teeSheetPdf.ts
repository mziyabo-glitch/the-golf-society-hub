/**
 * Tee Sheet PDF Generator
 *
 * Generates clean, printable tee sheets with:
 * - Event header (society name, event name, date, course, format)
 * - NTP/LD competition holes
 * - Player groups with columns: Full Name | HI | PH
 * - WHS handicap calculations with gender-based tee selection
 */

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
import { assertNoPrintAsync } from "./pdf/exportContract";
import { printHtmlToPdfFileAsync } from "./pdf/printHtmlToPdfFile";
import { sharePdfAsync } from "./pdf/sharePdf";
import { getSocietyLogoDataUri, getSocietyLogoUrl } from "./societyLogo";

export type TeeSheetPlayer = {
  id?: string;
  name: string;
  handicapIndex?: number | null;
  gender?: "male" | "female" | null;
  status?: string | null;
  teeTime?: string | null;
  group?: number | null;
};

export type TeeSheetData = {
  // Society branding
  societyId?: string;
  societyName: string;
  logoUrl?: string | null;
  jointSocieties?: { societyId: string; societyName: string; logoUrl?: string | null }[];
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
  status?: string | null;
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

/**
 * Generate HTML for the tee sheet PDF
 */
function generateTeeSheetHTML(
  data: TeeSheetData,
  _logoSrc?: string | null,
  _jointLogoSrcs?: { src: string | null; name: string }[],
): string {
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
  const competitionLines = [
    nearestPinHoles && nearestPinHoles.length > 0
      ? `Nearest the Pin (NTP): Hole${nearestPinHoles.length > 1 ? "s" : ""} ${formatHoleNumbers(nearestPinHoles)}`
      : null,
    longestDriveHoles && longestDriveHoles.length > 0
      ? `Longest Drive (LD): Hole${longestDriveHoles.length > 1 ? "s" : ""} ${formatHoleNumbers(longestDriveHoles)}`
      : null,
  ].filter((line): line is string => Boolean(line));

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
      status: player.status ?? null,
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

  // Cap to 12 groups (48 players max on a single compact A4 page).
  const capped = groups.slice(0, 12);
  const groupsWithTimes: GroupWithTime[] = capped.map((group, index) => ({
    ...group,
    teeTime: buildTeeTime(baseStartTime, intervalMinutes, index),
  }));
  const rows = groupsWithTimes.flatMap((group) =>
    group.players.map((player) => {
      const p = player as PlayerWithCalcs;
      return {
        group: String(group.groupNumber),
        teeTime: group.teeTime,
        name: p.name,
        hi: formatHandicap(p.handicapIndex, 1),
        status: shortStatusLabel(p.status),
      };
    }),
  );
  const useFallback11 = rows.length > 44;

  const jointMatch = societyName.match(/^Joint:\s*(.+)$/i);
  const jointLine = jointMatch ? jointMatch[1].trim() : null;
  if (__DEV__) {
    console.log("[png] joint mode decision", {
      source: "lib/teeSheetPdf.ts::generateTeeSheetHTML",
      eventId: eventName || null,
      uiToggleValue: null,
      event_is_joint_event: !!jointLine,
      linkedSocietiesCount: jointLine ? jointLine.split("&").map((x) => x.trim()).filter(Boolean).length : 1,
      participantSocietiesCount: jointLine ? jointLine.split("&").map((x) => x.trim()).filter(Boolean).length : 1,
    });
    console.log("[png] snapshot source", {
      source: "lib/teeSheetPdf.ts::generateTeeSheetHTML",
      eventId: eventName || null,
      isJoint: !!jointLine,
      sourceUsed: preGrouped ? "preGrouped payload" : "auto-grouped payload",
      playerIds: players.map((p) => p.id ?? null),
      displayNames: players.map((p) => p.name),
      societiesRepresented: [societyName],
    });
  }

  const sublineBits = [
    societyName,
    formatLabel || null,
    teeSettings ? `${teeName || "Men"} Par ${teeSettings.par}` : null,
    ladiesTeeSettings ? `${ladiesTeeName || "Ladies"} Par ${ladiesTeeSettings.par}` : null,
    `Allowance ${Math.round(allowance * 100)}%`,
  ].filter((v): v is string => Boolean(v));
  const competitionLine = hasCompetitions ? competitionLines.join("  |  ") : null;
  const tableRowsHtml = rows
    .map(
      (row) => `
        <tr>
          <td class="col-group">${escapeHtml(row.group)}</td>
          <td class="col-time">${escapeHtml(row.teeTime)}</td>
          <td class="col-name">${escapeHtml(row.name)}</td>
          <td class="col-hi">${escapeHtml(row.hi)}</td>
          <td class="col-status">${escapeHtml(row.status)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Tee Sheet - ${escapeHtml(eventName)}</title>
      </head>
      <body>
        <div class="pdf-root ${useFallback11 ? "fallback-11" : ""}">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { margin: 0; padding: 0; width: 100%; max-width: 100%; overflow: hidden; }
          @page {
            size: A4;
            margin: 10mm;
          }
          .pdf-root {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            color: #111;
            background: #fff;
            font-size: 12px;
            line-height: 1.2;
            width: 100%;
            max-width: 100%;
            overflow: hidden;
          }
          .sheet-page {
            width: 100%;
            max-width: 100%;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .sheet-header {
            border: 1px solid #bbb;
            padding: 6px 8px;
            margin-bottom: 6px;
            page-break-inside: avoid;
          }
          .header-line {
            font-size: 14px;
            font-weight: 700;
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .header-subline {
            margin-top: 2px;
            font-size: 11px;
            color: #333;
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .sheet-table {
            width: 100%;
            max-width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            font-size: 12px;
            border: 1px solid #bbb;
            page-break-inside: avoid;
          }
          .sheet-table thead th {
            background: #f4f4f4;
            font-weight: 700;
            padding: 4px 6px;
            border: 1px solid #bbb;
            text-align: left;
            white-space: nowrap;
          }
          .sheet-table tbody td {
            padding: 4px 6px;
            border: 1px solid #bbb;
            vertical-align: middle;
            line-height: 1.15;
            page-break-inside: avoid;
          }
          .sheet-table tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .col-group { width: 8%; white-space: nowrap; }
          .col-time { width: 14%; white-space: nowrap; }
          .col-name {
            width: 52%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .col-hi {
            width: 10%;
            text-align: right;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
          }
          .col-status { width: 16%; white-space: nowrap; }
          .fallback-11 .sheet-table,
          .fallback-11 .sheet-table thead th,
          .fallback-11 .sheet-table tbody td,
          .fallback-11 .header-subline { font-size: 11px; }
          .fallback-11 .sheet-table tbody td,
          .fallback-11 .sheet-table thead th { padding: 3px 5px; }
        </style>
        <div class="sheet-page">
          <div class="sheet-header">
            <div class="header-line">${escapeHtml(eventName)} | ${escapeHtml(dateStr)} | ${escapeHtml(courseName || "Course TBC")}</div>
            <div class="header-subline">${escapeHtml(sublineBits.join(" | "))}${jointLine ? ` | ${escapeHtml(`Joint: ${jointLine}`)}` : ""}${competitionLine ? ` | ${escapeHtml(competitionLine)}` : ""}</div>
          </div>
          <table class="sheet-table">
            <thead>
              <tr>
                <th class="col-group">Group</th>
                <th class="col-time">Tee time</th>
                <th class="col-name">Name</th>
                <th class="col-hi">Handicap</th>
                <th class="col-status">Status</th>
              </tr>
            </thead>
            <tbody>
              ${
                tableRowsHtml ||
                `<tr><td colspan="5" style="text-align:center; color:#666;">No players registered yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
        </div>
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
    const rawLogoUrl = getSocietyLogoUrl({ logo_url: data.logoUrl, logoUrl: data.logoUrl });
    const logoDataUri = data.societyId
      ? await getSocietyLogoDataUri(data.societyId, { logoUrl: rawLogoUrl })
      : null;
    const logoSrc = logoDataUri ?? rawLogoUrl;

    let jointLogoSrcs: { src: string | null; name: string }[] | undefined;
    if ((data.jointSocieties?.length ?? 0) > 1) {
      const logos = await Promise.all(
        (data.jointSocieties ?? []).slice(0, 2).map(async (s) => {
          const src = await getSocietyLogoDataUri(s.societyId, { logoUrl: s.logoUrl ?? null });
          return { src: src ?? s.logoUrl ?? null, name: s.societyName };
        }),
      );
      jointLogoSrcs = logos;
    }

    const html = generateTeeSheetHTML(data, logoSrc, jointLogoSrcs);

    const { uri } = await printHtmlToPdfFileAsync({
      html,
      base64: false,
    });

    console.log("[teeSheetPdf] PDF file created at:", uri);

    const safeName = String(data.eventName ?? "tee-sheet")
      .trim()
      .replace(/[/\\?%*:|"<>]/g, "-")
      .slice(0, 80);
    await sharePdfAsync({
      uri,
      mimeType: "application/pdf",
      dialogTitle: `Tee Sheet - ${data.eventName}`,
      filename: `tee-sheet-${safeName || "event"}`,
    });

    return true;
  } catch (error: any) {
    console.error("[teeSheetPdf] generateTeeSheetPdf error:", error);
    throw error;
  }
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

function shortStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  const s = status.trim().toLowerCase();
  if (!s) return "";
  if (s.includes("paid")) return "Paid";
  if (s.includes("confirmed")) return "Conf";
  if (s.includes("wait")) return "Wait";
  if (s.includes("cancel")) return "Cancel";
  if (s.includes("guest")) return "Guest";
  return status.trim().slice(0, 8);
}
