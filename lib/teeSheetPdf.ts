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
  logoSrc?: string | null,
  jointLogoSrcs?: { src: string | null; name: string }[],
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

  // Cap to 12 groups and pad blank slots so every page is a full 6+6 grid.
  const capped = groups.slice(0, 12);
  const groupsWithTimes: GroupWithTime[] = capped.map((group, index) => ({
    ...group,
    teeTime: buildTeeTime(baseStartTime, intervalMinutes, index),
  }));
  while (groupsWithTimes.length < 12) {
    const idx = groupsWithTimes.length;
    groupsWithTimes.push({
      groupNumber: idx + 1,
      players: [],
      teeTime: buildTeeTime(baseStartTime, intervalMinutes, idx),
    });
  }

  const pages = [groupsWithTimes];

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

  const teeInfoLines = [
    teeSettings
      ? `Men: ${teeName || "White"} — Par ${teeSettings.par} | CR ${teeSettings.courseRating} | SR ${teeSettings.slopeRating}`
      : "Men: tee not set",
    ladiesTeeSettings
      ? `Ladies: ${ladiesTeeName || "Red"} — Par ${ladiesTeeSettings.par} | CR ${ladiesTeeSettings.courseRating} | SR ${ladiesTeeSettings.slopeRating}`
      : "Ladies: tee not set",
    `Allowance: ${Math.round(allowance * 100)}%`,
  ];

  const renderGroupTable = (group: GroupWithTime) => {
    const rows = Array.from({ length: 4 }).map((_, idx) => {
      const player = group.players[idx];
      const name = player?.name ? escapeHtml(player.name) : "&nbsp;";
      const hiDisplay = player ? formatHandicap(player.handicapIndex, 1) : "&nbsp;";
      const phDisplay = player ? formatHandicap(player.playingHandicap) : "&nbsp;";
      const rowClass = idx === 3 ? "player-row player-row-last" : "player-row";
      const emptyClass = !player ? " row-empty" : "";

      return `
        <tr class="${rowClass}${emptyClass}">
          <td class="col-name">${name}</td>
          <td class="col-hi">${hiDisplay}</td>
          <td class="col-ph">${phDisplay}</td>
        </tr>
      `;
    });

    return `
      <div class="group-wrap">
        <div class="time-col">${escapeHtml(group.teeTime)}</div>
        <table class="group-table">
          <thead>
            <tr>
              <th class="col-name">NAME</th>
              <th class="col-hi">HI</th>
              <th class="col-ph">PH</th>
            </tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>
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
              ${
                jointLogoSrcs && jointLogoSrcs.length > 1
                  ? `<div class="joint-logo-stack">${
                      jointLogoSrcs.slice(0, 2).map((l) =>
                        l.src
                          ? `<img class="logo logo-joint" src="${escapeAttribute(l.src)}" alt="${escapeAttribute(l.name)}" />`
                          : `<div class="logo-placeholder logo-joint">${escapeHtml(l.name.slice(0, 2).toUpperCase())}</div>`
                      ).join("")
                    }</div>`
                  : (
                    logoSrc
                      ? `<img class="logo" src="${escapeAttribute(logoSrc)}" alt="" />`
                      : `<div class="logo-placeholder">${escapeHtml(societyName.slice(0, 2).toUpperCase())}</div>`
                  )
              }
            </div>
            <div class="header-center">
              <div class="event-title">${escapeHtml(eventName)}</div>
              <div class="event-meta">${escapeHtml(dateStr)}${courseName ? ` · ${escapeHtml(courseName)}` : ""}${formatLabel ? ` · ${escapeHtml(formatLabel)}` : ""}</div>
              ${jointLine ? `<div class="joint-line">JOINT · ${escapeHtml(jointLine)}</div>` : ""}
            </div>
            <div class="header-right">
              <div class="tee-box">
                ${teeInfoLines.map((line) => `<div class="tee-line">${escapeHtml(line)}</div>`).join("")}
              </div>
            </div>
          </div>

          <div class="grid">
            <div class="column">${leftHtml || "<div class='empty-column'>No groups</div>"}</div>
            <div class="column">${rightHtml || "<div class='empty-column'> </div>"}</div>
          </div>

          <div class="special-info">
            ${
              hasCompetitions
                ? `<div class="special-body">
                    ${competitionLines.map((line) => `<div class="competition-line">${escapeHtml(line)}</div>`).join("")}
                   </div>`
                : `<div class="special-body special-body-muted">Competition holes: not set</div>`
            }
          </div>

          <div class="footer">
            <div class="footer-brand">Produced by The Golf Society Hub</div>
            <div class="footer-page">Page ${pageIndex + 1} of ${pages.length}</div>
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
        <title>Tee Sheet - ${escapeHtml(eventName)}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @page {
            size: A4 landscape;
            margin: 12mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            padding: 0;
            color: #111827;
            background: #fff;
            font-size: 11px;
            line-height: 1.35;
          }
          .page {
            page-break-after: always;
            padding: 16px 20px 12px;
            min-height: 100%;
            background: #fff;
          }
          .page:last-child { page-break-after: auto; }
          .header-row {
            display: flex;
            align-items: flex-start;
            margin-bottom: 14px;
            min-height: 88px;
          }
          .header-left {
            width: 88px;
            flex-shrink: 0;
          }
          .logo { width: 56px; height: 56px; object-fit: contain; object-position: left top; display: block; }
          .joint-logo-stack { display: flex; flex-direction: row; gap: 6px; align-items: flex-start; }
          .logo-joint { width: 42px; height: 42px; }
          .logo-placeholder {
            width: 56px;
            height: 56px;
            border: 1px solid #e5e7eb;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            color: #6b7280;
            background: #fafafa;
          }
          .header-center { flex: 1; text-align: center; padding: 0 12px; }
          .event-title { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; color: #111827; }
          .event-meta { font-size: 11px; color: #6b7280; }
          .joint-line { margin-top: 10px; font-size: 8px; letter-spacing: 0.09em; color: #c4c4c4; font-weight: 500; }
          .header-right { width: 268px; flex-shrink: 0; }
          .tee-box {
            border: 1px solid #e5e7eb;
            padding: 10px 12px;
            background: #fafafa;
          }
          .tee-line { font-size: 9px; color: #374151; line-height: 14px; margin-bottom: 4px; }

          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 8px;
          }
          .column {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .group-wrap {
            display: flex;
            align-items: flex-start;
            margin-bottom: 8px;
            padding-bottom: 6px;
            border-bottom: 1px solid #e8e8e8;
          }
          .time-col {
            width: 44px;
            flex-shrink: 0;
            padding-top: 22px;
            padding-right: 8px;
            text-align: right;
            font-size: 13px;
            font-weight: 600;
            color: #111827;
            border-right: 1px solid #ececec;
          }
          .group-table {
            flex: 1;
            width: 100%;
            border-collapse: collapse;
            margin-left: 8px;
          }
          .group-table thead th {
            font-size: 8px;
            letter-spacing: 0.085em;
            color: #4b5563;
            font-weight: 700;
            padding: 4px 0;
            border-bottom: 1px solid #e8e8e8;
            text-align: left;
          }
          .group-table thead .col-hi,
          .group-table thead .col-ph { text-align: right; }
          .group-table .col-name { width: auto; }
          .group-table .col-hi,
          .group-table .col-ph {
            width: 40px;
            text-align: right;
            font-variant-numeric: tabular-nums;
            font-family: ui-monospace, 'SF Mono', Consolas, monospace;
          }
          .group-table .col-hi { color: #374151; font-weight: 500; }
          .group-table .col-ph { color: #374151; font-weight: 600; }
          .group-table tbody td {
            font-size: 12px;
            padding: 4px 0;
            line-height: 15px;
            border-bottom: 1px solid #f0f0f0;
            vertical-align: middle;
          }
          .player-row-last td { border-bottom: none; }
          .row-empty td { color: #e8e8e8; opacity: 0.85; }

          .special-info {
            border-top: 1px solid #e5e7eb;
            padding-top: 8px;
            margin-top: 4px;
          }
          .special-body { font-size: 9px; color: #6b7280; line-height: 13px; }
          .competition-line { margin-bottom: 2px; }
          .competition-line:last-child { margin-bottom: 0; }
          .special-body-muted { font-size: 8px; color: #c4c4c4; line-height: 12px; letter-spacing: 0.02em; }

          .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #e5e7eb;
            padding-top: 8px;
            margin-top: 6px;
          }
          .footer-brand { font-size: 8px; color: #9ca3af; }
          .footer-page { font-size: 8px; color: #d1d5db; }
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
