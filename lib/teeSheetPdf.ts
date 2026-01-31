/**
 * Tee Sheet PDF Generator
 *
 * Generates branded PDF tee sheets with:
 * - Society logo and ManCo details
 * - WHS handicap information (HI, CH, PH) based on player gender
 * - Proper player grouping (max 4 per group, avoid singles)
 * - NTP/LD competition holes
 * - Support for different Men's and Ladies' tees
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { type ManCoDetails } from "./db_supabase/memberRepo";
import {
  calculateHandicaps,
  formatHandicapIndex,
  hasTeeSettings,
  type TeeSettings,
} from "./handicapUtils";
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
  gender?: "M" | "F" | null;
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
  teeSettings?: TeeSettings | null;
  // Ladies' tee settings (optional, falls back to Men's if not provided)
  ladiesTeeSettings?: TeeSettings | null;

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
  gender: "M" | "F" | null;
  tee: string;
};

/**
 * Generate HTML for the tee sheet PDF
 */
function generateTeeSheetHTML(data: TeeSheetData): string {
  const {
    societyName,
    logoUrl,
    manCo,
    eventName,
    eventDate,
    courseName,
    teeName,
    ladiesTeeName,
    format,
    teeSettings,
    ladiesTeeSettings,
    nearestPinHoles,
    longestDriveHoles,
    players,
    startTime,
    teeTimeInterval = 10,
    preGrouped = false,
  } = data;

  // Check if we can calculate handicaps
  const canCalculateMenHandicaps = hasTeeSettings(teeSettings);
  const canCalculateLadiesHandicaps = hasTeeSettings(ladiesTeeSettings);
  const canCalculateAnyHandicaps = canCalculateMenHandicaps || canCalculateLadiesHandicaps;

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

  // Tee info
  const teeInfo = teeName
    ? `${teeName}${teeSettings?.slopeRating ? ` (SR ${teeSettings.slopeRating})` : ""}`
    : "";

  // Logo HTML - either image or initials fallback
  const logoHTML = logoUrl
    ? `<img src="${logoUrl}" alt="Society Logo" style="width: 60px; height: 60px; object-fit: contain; border-radius: 8px;" onerror="this.style.display='none'" />`
    : `<div style="width: 60px; height: 60px; background: #E8F5F0; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: #0B6E4F;">${getInitials(societyName)}</div>`;

  // ManCo block
  const manCoItems: string[] = [];
  if (manCo.captain) manCoItems.push(`<span style="color: #6B7280;">Captain:</span> ${manCo.captain}`);
  if (manCo.secretary) manCoItems.push(`<span style="color: #6B7280;">Secretary:</span> ${manCo.secretary}`);
  if (manCo.treasurer) manCoItems.push(`<span style="color: #6B7280;">Treasurer:</span> ${manCo.treasurer}`);
  if (manCo.handicapper) manCoItems.push(`<span style="color: #6B7280;">Handicapper:</span> ${manCo.handicapper}`);

  const manCoHTML = manCoItems.length > 0
    ? `<div style="background: #F9FAFB; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
         <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9CA3AF; margin-bottom: 6px;">Management Committee</div>
         <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 12px;">
           ${manCoItems.map(item => `<div>${item}</div>`).join("")}
         </div>
       </div>`
    : "";

  // Tee settings info box (show both Men's and Ladies' if configured)
  let teeSettingsHTML = "";
  if (canCalculateMenHandicaps || canCalculateLadiesHandicaps) {
    const teeLines: string[] = [];
    if (canCalculateMenHandicaps) {
      teeLines.push(`<div><span style="display: inline-block; width: 10px; height: 10px; background: #FFD700; border-radius: 50%; margin-right: 6px;"></span><strong>${teeName || "Men's"}</strong>: Par ${teeSettings?.par} • CR ${teeSettings?.courseRating} • Slope ${teeSettings?.slopeRating}</div>`);
    }
    if (canCalculateLadiesHandicaps) {
      teeLines.push(`<div><span style="display: inline-block; width: 10px; height: 10px; background: #E53935; border-radius: 50%; margin-right: 6px;"></span><strong>${ladiesTeeName || "Ladies'"}</strong>: Par ${ladiesTeeSettings?.par} • CR ${ladiesTeeSettings?.courseRating} • Slope ${ladiesTeeSettings?.slopeRating}</div>`);
    }
    const allowance = teeSettings?.handicapAllowance ?? ladiesTeeSettings?.handicapAllowance ?? 0.95;
    teeSettingsHTML = `<div style="background: #FEF3C7; padding: 10px 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #F59E0B;">
       <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #92400E; margin-bottom: 4px;">Course Setup • Allowance ${Math.round(allowance * 100)}%</div>
       <div style="font-size: 12px; color: #78350F; display: flex; flex-direction: column; gap: 2px;">
         ${teeLines.join("")}
       </div>
     </div>`;
  }

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
    // Use ladies tee settings for female players if available
    const useLadiesTees = gender === "F" && canCalculateLadiesHandicaps;
    const playerTeeSettings = useLadiesTees ? ladiesTeeSettings : teeSettings;
    const handicaps = calculateHandicaps(player.handicapIndex, playerTeeSettings);
    const teeName = useLadiesTees
      ? (ladiesTeeName || "Ladies'")
      : (data.teeName || "Men's");

    return {
      id: player.id || String(idx),
      name: player.name,
      handicapIndex: player.handicapIndex ?? null,
      courseHandicap: handicaps.courseHandicap,
      playingHandicap: handicaps.playingHandicap,
      gender,
      tee: teeName,
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

  // Generate group blocks
  const groupsHTML = groupsWithTimes.map((group) => {
    const playerRows = group.players.map((player: PlayerWithCalcs) => {
      const hiDisplay = formatHandicapIndex(player.handicapIndex);
      const chDisplay = player.courseHandicap != null ? String(player.courseHandicap) : "-";
      const phDisplay = player.playingHandicap != null ? String(player.playingHandicap) : "-";

      // Gender indicator
      const genderBadge = player.gender === "F"
        ? `<span style="display: inline-block; padding: 1px 5px; border-radius: 4px; background: #FEE2E2; color: #DC2626; font-size: 10px; margin-left: 4px;">F</span>`
        : player.gender === "M"
        ? `<span style="display: inline-block; padding: 1px 5px; border-radius: 4px; background: #DBEAFE; color: #2563EB; font-size: 10px; margin-left: 4px;">M</span>`
        : "";

      // Show tee if both men's and ladies' tees are configured
      const showTee = canCalculateMenHandicaps && canCalculateLadiesHandicaps;

      return `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #F3F4F6; font-weight: 500;">
            ${player.name}${genderBadge}
          </td>
          ${showTee ? `<td style="padding: 8px 10px; border-bottom: 1px solid #F3F4F6; text-align: center; font-size: 11px; color: #6B7280;">${player.tee}</td>` : ''}
          <td style="padding: 8px 10px; border-bottom: 1px solid #F3F4F6; text-align: center; color: #6B7280; font-family: 'SF Mono', Consolas, monospace; font-size: 12px;">${hiDisplay}</td>
          ${canCalculateAnyHandicaps ? `
          <td style="padding: 8px 10px; border-bottom: 1px solid #F3F4F6; text-align: center; color: #6B7280; font-family: 'SF Mono', Consolas, monospace; font-size: 12px;">${chDisplay}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #F3F4F6; text-align: center; font-weight: 600; color: #0B6E4F; font-family: 'SF Mono', Consolas, monospace; font-size: 12px;">${phDisplay}</td>
          ` : ''}
          <td style="padding: 8px 10px; border-bottom: 1px solid #F3F4F6; text-align: center; width: 80px;"></td>
        </tr>
      `;
    }).join("");

    // Show tee column header if both tees configured
    const showTeeHeader = canCalculateMenHandicaps && canCalculateLadiesHandicaps;

    return `
      <div style="margin-bottom: 16px; background: white; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; break-inside: avoid;">
        <div style="background: #0B6E4F; color: white; padding: 8px 12px; font-weight: 600; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
          <span>Group ${group.groupNumber}</span>
          ${group.teeTime ? `<span style="font-weight: 400; font-size: 12px;">${group.teeTime}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #F9FAFB;">
              <th style="padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600;">Player</th>
              ${showTeeHeader ? `<th style="padding: 8px 10px; text-align: center; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600;">Tee</th>` : ''}
              <th style="padding: 8px 10px; text-align: center; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600;" title="Handicap Index">HI</th>
              ${canCalculateAnyHandicaps ? `
              <th style="padding: 8px 10px; text-align: center; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600;" title="Course Handicap">CH</th>
              <th style="padding: 8px 10px; text-align: center; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600;" title="Playing Handicap">PH</th>
              ` : ''}
              <th style="padding: 8px 10px; text-align: center; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600;">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${playerRows}
          </tbody>
        </table>
      </div>
    `;
  }).join("");

  // Count men and women
  const menCount = players.filter(p => p.gender === "M").length;
  const womenCount = players.filter(p => p.gender === "F").length;
  const genderSummary = (menCount > 0 || womenCount > 0)
    ? ` (${menCount} men, ${womenCount} women)`
    : "";

  // Allowance for legend
  const allowance = teeSettings?.handicapAllowance ?? ladiesTeeSettings?.handicapAllowance ?? 0.95;

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
            font-size: 13px;
            line-height: 1.4;
          }
          .container { max-width: 700px; margin: 0 auto; }

          /* Header with logo */
          .header {
            display: flex;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 2px solid #0B6E4F;
          }
          .header-text { flex: 1; }
          .society-name {
            font-size: 16px;
            font-weight: 700;
            color: #0B6E4F;
            margin-bottom: 2px;
          }
          .branding {
            font-size: 10px;
            color: #9CA3AF;
            font-style: italic;
          }

          /* Event details */
          .event-header {
            margin-bottom: 16px;
          }
          .event-name {
            font-size: 20px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 4px;
          }
          .event-meta {
            font-size: 13px;
            color: #6B7280;
          }

          /* Footer */
          .footer {
            margin-top: 20px;
            padding-top: 12px;
            border-top: 1px solid #E5E7EB;
            text-align: center;
          }
          .footer-text {
            font-size: 10px;
            color: #9CA3AF;
            font-style: italic;
          }
          .player-count {
            font-size: 11px;
            color: #6B7280;
            margin-bottom: 6px;
          }

          /* Handicap legend */
          .legend {
            margin-top: 12px;
            padding: 10px;
            background: #F9FAFB;
            border-radius: 6px;
            font-size: 10px;
            color: #6B7280;
          }
          .legend-title {
            font-weight: 600;
            color: #374151;
            margin-bottom: 3px;
          }

          @media print {
            body { padding: 16px; }
            .container { max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header with Logo and Society Name -->
          <div class="header">
            ${logoHTML}
            <div class="header-text">
              <div class="society-name">${societyName}</div>
              <div class="branding">Produced by The Golf Society Hub</div>
            </div>
          </div>

          <!-- Event Details -->
          <div class="event-header">
            <div class="event-name">${eventName}</div>
            <div class="event-meta">
              ${dateStr}${courseName ? ` • ${courseName}` : ""}${teeInfo ? ` • ${teeInfo}` : ""}${formatLabel ? ` • ${formatLabel}` : ""}
            </div>
          </div>

          <!-- ManCo Block -->
          ${manCoHTML}

          <!-- Tee Settings Info -->
          ${teeSettingsHTML}

          <!-- Competition Holes -->
          ${competitionsHTML}

          <!-- Player Groups -->
          ${players.length > 0 ? groupsHTML : `<p style="color: #6B7280; text-align: center; padding: 24px;">No players registered yet.</p>`}

          ${canCalculateAnyHandicaps ? `
          <!-- Handicap Legend -->
          <div class="legend">
            <div class="legend-title">WHS Handicap Calculations</div>
            <div>HI = Handicap Index • CH = Course Handicap (HI × Slope/113 + CR-Par) • PH = Playing Handicap (CH × ${Math.round(allowance * 100)}%)</div>
            ${canCalculateMenHandicaps && canCalculateLadiesHandicaps ? `<div style="margin-top: 4px;">Note: Handicaps calculated using the appropriate tee for each player's gender.</div>` : ""}
          </div>
          ` : ""}

          <!-- Footer -->
          <div class="footer">
            <div class="player-count">${players.length} player${players.length !== 1 ? "s" : ""}${genderSummary} • ${groupsWithTimes.length} group${groupsWithTimes.length !== 1 ? "s" : ""}</div>
            <div class="footer-text">Generated on ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Get initials from name for fallback logo
 */
function getInitials(name: string): string {
  if (!name) return "GS";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return name.substring(0, 2).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
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
