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
import { Platform } from "react-native";
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

/**
 * Generate HTML for the tee sheet PDF
 */
function generateTeeSheetHTML(data: TeeSheetData): string {
  const {
    societyName,
    eventName,
    eventDate,
    courseName,
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

  // NTP/LD info box
  const hasCompetitions = (nearestPinHoles && nearestPinHoles.length > 0) ||
                          (longestDriveHoles && longestDriveHoles.length > 0);
  const competitionsHTML = hasCompetitions
    ? `<div style="background: #EDE9FE; padding: 10px 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #8B5CF6;">
         <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #5B21B6; margin-bottom: 4px;">Competitions</div>
         <div style="font-size: 12px; color: #4C1D95; display: flex; gap: 24px;">
           ${nearestPinHoles && nearestPinHoles.length > 0 ? `<div><strong>Nearest the Pin:</strong> Hole${nearestPinHoles.length > 1 ? 's' : ''} ${formatHoleNumbers(nearestPinHoles)}</div>` : ''}
           ${longestDriveHoles && longestDriveHoles.length > 0 ? `<div><strong>Longest Drive:</strong> Hole${longestDriveHoles.length > 1 ? 's' : ''} ${formatHoleNumbers(longestDriveHoles)}</div>` : ''}
         </div>
       </div>`
    : "";

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

  // Assign tee times if start time provided
  let groupsWithTimes = groups;
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

  // Generate group blocks with columns: Full Name | HI | PH
  const groupsHTML = groupsWithTimes.map((group) => {
    const playerRows = group.players.map((player: PlayerWithCalcs) => {
      // HI: from members.handicap_index (nullable) - display "-" if null
      const hiDisplay = formatHandicap(player.handicapIndex, 1);
      // PH: calculated using WHS formula, display "-" if cannot calculate
      const phDisplay = formatHandicap(player.playingHandicap);

      return `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #F3F4F6; font-weight: 500;">
            ${player.name}
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #F3F4F6; text-align: center; color: #6B7280; font-family: 'SF Mono', Consolas, monospace; font-size: 13px;">${hiDisplay}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #F3F4F6; text-align: center; font-weight: 600; color: #0B6E4F; font-family: 'SF Mono', Consolas, monospace; font-size: 13px;">${phDisplay}</td>
        </tr>
      `;
    }).join("");

    return `
      <div style="margin-bottom: 16px; background: white; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; break-inside: avoid;">
        <div style="background: #0B6E4F; color: white; padding: 10px 14px; font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center;">
          <span>Group ${group.groupNumber}</span>
          ${group.teeTime ? `<span style="font-weight: 400; font-size: 13px;">${group.teeTime}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background: #F9FAFB;">
              <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600;">Full Name</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600; width: 60px;" title="Handicap Index">HI</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600; width: 60px;" title="Playing Handicap">PH</th>
            </tr>
          </thead>
          <tbody>
            ${playerRows}
          </tbody>
        </table>
      </div>
    `;
  }).join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Tee Sheet - ${eventName}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 24px;
            color: #111827;
            background: #fff;
            font-size: 14px;
            line-height: 1.4;
          }
          .container { max-width: 700px; margin: 0 auto; }

          /* Header */
          .header {
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 2px solid #0B6E4F;
          }
          .society-name {
            font-size: 14px;
            font-weight: 600;
            color: #0B6E4F;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .event-name {
            font-size: 22px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 4px;
          }
          .event-meta {
            font-size: 14px;
            color: #6B7280;
          }

          /* Footer */
          .footer {
            margin-top: 24px;
            padding-top: 12px;
            border-top: 1px solid #E5E7EB;
            text-align: center;
            font-size: 12px;
            color: #6B7280;
          }

          @media print {
            body { padding: 16px; }
            .container { max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            <div class="society-name">${societyName}</div>
            <div class="event-name">${eventName}</div>
            <div class="event-meta">
              ${dateStr}${courseName ? ` • ${courseName}` : ""}${formatLabel ? ` • ${formatLabel}` : ""}
            </div>
          </div>

          <!-- Competition Holes -->
          ${competitionsHTML}

          <!-- Player Groups -->
          ${players.length > 0 ? groupsHTML : `<p style="color: #6B7280; text-align: center; padding: 24px;">No players registered yet.</p>`}

          <!-- Footer -->
          <div class="footer">
            ${players.length} player${players.length !== 1 ? "s" : ""} • ${groupsWithTimes.length} group${groupsWithTimes.length !== 1 ? "s" : ""}
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
    const html = generateTeeSheetHTML(data);

    // On web, use printAsync which opens print dialog
    if (Platform.OS === "web") {
      await Print.printAsync({ html });
      return true;
    }

    // On native, generate PDF file and share
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    console.log("[teeSheetPdf] PDF file created at:", uri);

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Tee Sheet - ${data.eventName}`,
        UTI: "com.adobe.pdf",
      });
    } else {
      // Fallback to print if sharing not available
      await Print.printAsync({ html });
    }

    return true;
  } catch (error: any) {
    console.error("[teeSheetPdf] generateTeeSheetPdf error:", error);
    throw error;
  }
}
