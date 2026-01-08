/**
 * Shared Tee Sheet HTML Generator
 * 
 * Used by both the tee sheet screen (for native PDF export) and
 * the print route (for web print export).
 */

import type { Course, TeeSet, EventData, MemberData } from "./models";
import { getPlayingHandicap } from "./handicap";
import { formatDateDDMMYYYY } from "@/utils/date";

export interface TeeSheetPrintOptions {
  society: {
    name: string;
    logoUrl?: string | null;
  } | null;
  event: EventData;
  course: Course | null;
  maleTeeSet: TeeSet | null;
  femaleTeeSet: TeeSet | null;
  members: MemberData[];
  guests: Array<{
    id: string;
    name: string;
    sex: "male" | "female";
    handicapIndex?: number;
  }>;
  teeGroups: Array<{
    timeISO: string;
    players: string[];
  }>;
  teeSheetNotes: string;
  nearestToPinHoles: number[];
  longestDriveHoles: number[];
  handicapAllowancePct: number;
}

/**
 * Find ManCo members from the members list
 */
export function getManCoMembers(members: MemberData[]): {
  captain: MemberData | undefined;
  secretary: MemberData | undefined;
  treasurer: MemberData | undefined;
  handicapper: MemberData | undefined;
} {
  const captain = members.find((m) =>
    m.roles?.some((r) => r.toLowerCase() === "captain" || r.toLowerCase() === "admin")
  );
  const secretary = members.find((m) =>
    m.roles?.some((r) => r.toLowerCase() === "secretary")
  );
  const treasurer = members.find((m) =>
    m.roles?.some((r) => r.toLowerCase() === "treasurer")
  );
  const handicapper = members.find((m) =>
    m.roles?.some((r) => r.toLowerCase() === "handicapper")
  );
  return { captain, secretary, treasurer, handicapper };
}

/**
 * Generate Tee Sheet HTML for printing/PDF export
 * 
 * This is the single source of truth for tee sheet HTML generation.
 * Used by:
 * - app/tees-teesheet.tsx (for native PDF via expo-print)
 * - app/print/tee-sheet.tsx (for web print route)
 */
export function generateTeeSheetHtml(options: TeeSheetPrintOptions): string {
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
    handicapAllowancePct,
  } = options;

  // Get ManCo members
  const manCo = getManCoMembers(members);
  const manCoDetails: string[] = [];
  if (manCo.captain) manCoDetails.push(`Captain: ${manCo.captain.name}`);
  if (manCo.secretary) manCoDetails.push(`Secretary: ${manCo.secretary.name}`);
  if (manCo.treasurer) manCoDetails.push(`Treasurer: ${manCo.treasurer.name}`);
  if (manCo.handicapper) manCoDetails.push(`Handicapper: ${manCo.handicapper.name}`);

  const logoHtml = society?.logoUrl
    ? `<img src="${society.logoUrl}" alt="Society Logo" style="max-width: 80px; max-height: 80px; margin-bottom: 10px;" onerror="this.style.display='none'" />`
    : "";

  const eventDate = event?.date ? formatDateDDMMYYYY(event.date) : "Date TBD";
  const courseName = course?.name || event?.courseName || "Course TBD";

  // Generate tee groups HTML
  const teeGroupsHtml = teeGroups
    .map((group, groupIdx) => {
      const timeStr = new Date(group.timeISO).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      if (group.players.length === 0) {
        return `<tr><td class="time-col">${timeStr}</td><td class="group-col">${groupIdx + 1}</td><td colspan="3" class="empty-group">Empty group</td></tr>`;
      }

      return group.players
        .map((playerId, playerIdx) => {
          const member = members.find((m) => m.id === playerId);
          const guest = guests.find((g) => g.id === playerId);
          if (!member && !guest) return "";

          const player = member || {
            id: guest!.id,
            name: guest!.name,
            handicap: guest!.handicapIndex,
            sex: guest!.sex,
          };

          const ph = getPlayingHandicap(player, event, course, maleTeeSet, femaleTeeSet);
          const displayName = guest ? `${player.name || "Guest"} (Guest)` : player.name || "Unknown";

          return `
            <tr>
              ${playerIdx === 0 ? `<td class="time-col" rowspan="${group.players.length}">${timeStr}</td>` : ""}
              ${playerIdx === 0 ? `<td class="group-col" rowspan="${group.players.length}">${groupIdx + 1}</td>` : ""}
              <td class="name-col">${displayName}</td>
              <td class="hi-col">${player.handicap ?? "-"}</td>
              <td class="ph-col">${ph ?? "-"}</td>
            </tr>
          `;
        })
        .join("");
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tee Sheet - ${event?.name || "Export"}</title>
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
    .no-print a { 
      color: #0B6E4F; 
      text-decoration: none; 
      font-weight: 600;
      padding: 8px 16px;
      background: #f3f4f6;
      border-radius: 6px;
      display: inline-block;
    }
    .no-print a:hover { background: #e5e7eb; }
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
    .hi-col, .ph-col { width: 45px; text-align: center; }
    .empty-group { font-style: italic; color: #666; }
    tr:nth-child(even) { background-color: #f9fafb; }
    @media print { 
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; }
      .no-print { display: none !important; }
    }
    @page {
      size: A4;
      margin: 10mm;
    }
  </style>
</head>
<body>
  <div class="top-header">
    <div class="logo-container">
      ${logoHtml}
    </div>
    <div class="header">
      <h1>${event?.name || "Tee Sheet"}</h1>
      <div class="event-details">${eventDate} — ${courseName}</div>
      ${manCoDetails.length > 0 ? `<div class="manco">${manCoDetails.map((d) => `<span>${d}</span>`).join("")}</div>` : ""}
      <div class="produced-by">Produced by The Golf Society Hub</div>
    </div>
    <div class="tee-info">
      <h3>Tee Information</h3>
      ${maleTeeSet ? `<p><strong>Male:</strong> ${maleTeeSet.teeColor}<br>Par ${maleTeeSet.par} | CR ${maleTeeSet.courseRating} | SR ${maleTeeSet.slopeRating}</p>` : ""}
      ${femaleTeeSet ? `<p><strong>Female:</strong> ${femaleTeeSet.teeColor}<br>Par ${femaleTeeSet.par} | CR ${femaleTeeSet.courseRating} | SR ${femaleTeeSet.slopeRating}</p>` : ""}
      <p><strong>Allowance:</strong> ${handicapAllowancePct}%</p>
    </div>
  </div>
  ${teeSheetNotes && teeSheetNotes.trim() ? `
  <div class="notes-box">
    <p style="margin: 0;"><strong>Notes:</strong></p>
    <p style="margin: 4px 0 0 0; white-space: pre-wrap;">${teeSheetNotes.trim().replace(/\n/g, "<br>")}</p>
  </div>
  ` : ""}
  ${(nearestToPinHoles && nearestToPinHoles.length > 0) || (longestDriveHoles && longestDriveHoles.length > 0) ? `
  <div class="competitions-box">
    ${nearestToPinHoles && nearestToPinHoles.length > 0 ? `<p><strong>Nearest to Pin:</strong> Hole ${nearestToPinHoles.join(", Hole ")}</p>` : ""}
    ${longestDriveHoles && longestDriveHoles.length > 0 ? `<p><strong>Longest Drive:</strong> Hole ${longestDriveHoles.join(", Hole ")}</p>` : ""}
  </div>
  ` : ""}
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
    <tbody>
      ${teeGroupsHtml}
    </tbody>
  </table>
</body>
</html>
  `.trim();
}
