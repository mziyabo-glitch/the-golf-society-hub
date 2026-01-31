/**
 * Tee Sheet PDF Generator
 * Generates branded PDF tee sheets with society logo, ManCo details,
 * and WHS handicap information (HI, CH, PH)
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

export type TeeSheetPlayer = {
  name: string;
  handicapIndex?: number | null;
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
  format: string | null;

  // Tee settings for handicap calculations
  teeSettings?: TeeSettings | null;

  // Players
  players: TeeSheetPlayer[];
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
    format,
    teeSettings,
    players,
  } = data;

  // Check if we can calculate handicaps
  const canCalculateHandicaps = hasTeeSettings(teeSettings);

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

  // ManCo block - only show roles that are assigned
  const manCoItems: string[] = [];
  if (manCo.captain) manCoItems.push(`<span style="color: #6B7280;">Captain:</span> ${manCo.captain}`);
  if (manCo.secretary) manCoItems.push(`<span style="color: #6B7280;">Secretary:</span> ${manCo.secretary}`);
  if (manCo.treasurer) manCoItems.push(`<span style="color: #6B7280;">Treasurer:</span> ${manCo.treasurer}`);
  if (manCo.handicapper) manCoItems.push(`<span style="color: #6B7280;">Handicapper:</span> ${manCo.handicapper}`);

  const manCoHTML = manCoItems.length > 0
    ? `<div style="background: #F9FAFB; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
         <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #9CA3AF; margin-bottom: 8px;">Management Committee</div>
         <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 13px;">
           ${manCoItems.map(item => `<div>${item}</div>`).join("")}
         </div>
       </div>`
    : "";

  // Tee settings info box
  const teeSettingsHTML = canCalculateHandicaps
    ? `<div style="background: #FEF3C7; padding: 10px 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #F59E0B;">
         <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #92400E; margin-bottom: 4px;">Course Setup</div>
         <div style="font-size: 13px; color: #78350F;">
           Par ${teeSettings?.par} • CR ${teeSettings?.courseRating} • Slope ${teeSettings?.slopeRating} • Allowance ${Math.round((teeSettings?.handicapAllowance ?? 0.95) * 100)}%
         </div>
       </div>`
    : "";

  // Players table - group by tee time if available
  const playersWithGroups = players.map((p, idx) => ({
    ...p,
    displayGroup: p.group ?? Math.floor(idx / 4) + 1,
  }));

  // Calculate handicaps for each player
  const playersWithHandicaps = playersWithGroups.map((player) => {
    const handicaps = calculateHandicaps(player.handicapIndex, teeSettings);
    return {
      ...player,
      ...handicaps,
    };
  });

  const playerRows = playersWithHandicaps
    .map((player, idx) => {
      const isNewGroup = idx === 0 || player.displayGroup !== playersWithHandicaps[idx - 1].displayGroup;
      const groupHeader = isNewGroup
        ? `<tr>
             <td colspan="${canCalculateHandicaps ? 6 : 4}" style="background: #F3F4F6; padding: 8px 12px; font-weight: 600; font-size: 12px; color: #374151; border-bottom: 1px solid #E5E7EB;">
               Group ${player.displayGroup}${player.teeTime ? ` • ${player.teeTime}` : ""}
             </td>
           </tr>`
        : "";

      const hiDisplay = formatHandicapIndex(player.handicapIndex);
      const chDisplay = player.courseHandicap != null ? player.courseHandicap.toString() : "-";
      const phDisplay = player.playingHandicap != null ? player.playingHandicap.toString() : "-";

      return `${groupHeader}
        <tr style="background: ${idx % 2 === 0 ? "#FFFFFF" : "#FAFAFA"};">
          <td style="padding: 10px 12px; border-bottom: 1px solid #F3F4F6;">${player.name}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #F3F4F6; text-align: center; color: #6B7280; font-family: 'SF Mono', monospace;">${hiDisplay}</td>
          ${canCalculateHandicaps ? `
          <td style="padding: 10px 12px; border-bottom: 1px solid #F3F4F6; text-align: center; color: #6B7280; font-family: 'SF Mono', monospace;">${chDisplay}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #F3F4F6; text-align: center; font-weight: 600; color: #0B6E4F; font-family: 'SF Mono', monospace;">${phDisplay}</td>
          ` : ""}
          <td style="padding: 10px 12px; border-bottom: 1px solid #F3F4F6; text-align: center; color: #6B7280;">${player.teeTime || "-"}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #F3F4F6; text-align: center;"></td>
        </tr>`;
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
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 32px;
            color: #111827;
            background: #fff;
            font-size: 14px;
            line-height: 1.5;
          }
          .container { max-width: 700px; margin: 0 auto; }

          /* Header with logo */
          .header {
            display: flex;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 2px solid #0B6E4F;
          }
          .header-text { flex: 1; }
          .society-name {
            font-size: 18px;
            font-weight: 700;
            color: #0B6E4F;
            margin-bottom: 2px;
          }
          .branding {
            font-size: 11px;
            color: #9CA3AF;
            font-style: italic;
          }

          /* Event details */
          .event-header {
            margin-bottom: 20px;
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

          /* Players table */
          .players-section {
            margin-top: 16px;
          }
          .section-title {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #9CA3AF;
            margin-bottom: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            overflow: hidden;
          }
          th {
            background: #0B6E4F;
            color: white;
            padding: 10px 12px;
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 600;
          }
          th.center { text-align: center; }

          /* Footer */
          .footer {
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid #E5E7EB;
            text-align: center;
          }
          .footer-text {
            font-size: 11px;
            color: #9CA3AF;
            font-style: italic;
          }
          .player-count {
            font-size: 12px;
            color: #6B7280;
            margin-bottom: 8px;
          }

          /* Handicap legend */
          .legend {
            margin-top: 16px;
            padding: 12px;
            background: #F9FAFB;
            border-radius: 8px;
            font-size: 11px;
            color: #6B7280;
          }
          .legend-title {
            font-weight: 600;
            color: #374151;
            margin-bottom: 4px;
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

          <!-- Players Table -->
          <div class="players-section">
            <div class="section-title">Tee Sheet</div>
            ${players.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th class="center" title="Handicap Index">HI</th>
                  ${canCalculateHandicaps ? `
                  <th class="center" title="Course Handicap">CH</th>
                  <th class="center" title="Playing Handicap">PH</th>
                  ` : ""}
                  <th class="center">Tee Time</th>
                  <th class="center">Score</th>
                </tr>
              </thead>
              <tbody>
                ${playerRows}
              </tbody>
            </table>
            ` : `<p style="color: #6B7280; text-align: center; padding: 24px;">No players registered yet.</p>`}
          </div>

          ${canCalculateHandicaps ? `
          <!-- Handicap Legend -->
          <div class="legend">
            <div class="legend-title">WHS Handicap Calculations</div>
            <div>HI = Handicap Index • CH = Course Handicap (HI × Slope/113 + CR-Par) • PH = Playing Handicap (CH × ${Math.round((teeSettings?.handicapAllowance ?? 0.95) * 100)}%)</div>
          </div>
          ` : ""}

          <!-- Footer -->
          <div class="footer">
            <div class="player-count">${players.length} player${players.length !== 1 ? "s" : ""} registered</div>
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

    // On web, just print the HTML
    if (Platform.OS === "web") {
      await Print.printAsync({ html });
      return true;
    }

    // On native, generate PDF file and share
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

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
