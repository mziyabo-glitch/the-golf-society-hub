/**
 * Simplified Tee Sheet HTML Generator
 * 
 * Follows the EXACT same pattern as Season Leaderboard (generateOOMHtml):
 * - Pure string function (no JSX, no components)
 * - Inline styles only
 * - NO external images (no logo)
 * - NO optional field dependencies
 * 
 * Renders:
 * - Event name
 * - Event date
 * - Tee times
 * - Groups with player names only
 */

/**
 * Simple player type for tee sheet
 */
export interface SimpleTeeSheetPlayer {
  name: string;
}

/**
 * Simple group type for tee sheet
 */
export interface SimpleTeeSheetGroup {
  teeTime: string;
  players: SimpleTeeSheetPlayer[];
}

/**
 * Options for generating tee sheet HTML
 */
export interface GenerateTeeSheetHtmlOptions {
  eventName: string;
  eventDate: string;
  groups: SimpleTeeSheetGroup[];
}

/**
 * Validate tee sheet data before export
 * Returns error message if invalid, null if valid
 */
export function validateTeeSheetForExport(options: GenerateTeeSheetHtmlOptions): string | null {
  if (!options.eventName || options.eventName.trim().length === 0) {
    return "Event name is required";
  }
  
  if (!options.eventDate || options.eventDate.trim().length === 0) {
    return "Event date is required";
  }
  
  if (!options.groups || !Array.isArray(options.groups) || options.groups.length === 0) {
    return "No tee groups found. Please generate a tee sheet first.";
  }
  
  // Check that at least one group has players
  const hasPlayers = options.groups.some(g => g.players && g.players.length > 0);
  if (!hasPlayers) {
    return "No players in tee sheet. Please add players to groups.";
  }
  
  return null;
}

/**
 * Generate tee sheet HTML from simple data
 * 
 * SAME PATTERN AS generateOOMHtml:
 * - Pure string function
 * - All inline styles
 * - No external dependencies
 * - No images
 */
export function generateSimpleTeeSheetHtml(options: GenerateTeeSheetHtmlOptions): string {
  const { eventName, eventDate, groups } = options;
  
  // Safe values
  const safeEventName = (eventName || "Tee Sheet").trim();
  const safeEventDate = (eventDate || "Date TBD").trim();
  const safeGroups = Array.isArray(groups) ? groups : [];
  
  // Build groups HTML
  const groupsHtml = safeGroups
    .map((group, groupIndex) => {
      const safeTime = (group.teeTime || `Group ${groupIndex + 1}`).trim();
      const safePlayers = Array.isArray(group.players) ? group.players : [];
      
      if (safePlayers.length === 0) {
        return `
          <tr>
            <td style="text-align: center; font-weight: bold; background-color: #f3f4f6;">${safeTime}</td>
            <td style="text-align: center;">${groupIndex + 1}</td>
            <td style="font-style: italic; color: #666;">(Empty group)</td>
          </tr>
        `;
      }
      
      return safePlayers
        .map((player, playerIndex) => {
          const safeName = (player.name || "Unknown Player").trim();
          return `
            <tr>
              ${playerIndex === 0 ? `<td rowspan="${safePlayers.length}" style="text-align: center; font-weight: bold; vertical-align: middle; background-color: #f3f4f6;">${safeTime}</td>` : ""}
              ${playerIndex === 0 ? `<td rowspan="${safePlayers.length}" style="text-align: center; vertical-align: middle;">${groupIndex + 1}</td>` : ""}
              <td>${safeName}</td>
            </tr>
          `;
        })
        .join("");
    })
    .join("");
  
  // Calculate total players
  const totalPlayers = safeGroups.reduce((sum, g) => sum + (g.players?.length || 0), 0);
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Tee Sheet - ${safeEventName}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          font-size: 14px; 
          padding: 20px; 
          max-width: 800px; 
          margin: 0 auto;
        }
        .header { 
          text-align: center; 
          margin-bottom: 20px; 
          padding-bottom: 15px;
          border-bottom: 2px solid #0B6E4F;
        }
        .header h1 { 
          margin: 0 0 10px 0; 
          font-size: 24px; 
          font-weight: bold; 
          color: #0B6E4F;
        }
        .header p { 
          margin: 5px 0; 
          font-size: 14px; 
          color: #666; 
        }
        .summary {
          margin-bottom: 15px;
          font-size: 12px;
          color: #666;
        }
        .produced-by { 
          font-size: 10px; 
          color: #999; 
          margin-top: 10px; 
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-top: 15px; 
        }
        th, td { 
          border: 1px solid #333; 
          padding: 10px; 
          text-align: left; 
        }
        th { 
          background-color: #0B6E4F; 
          color: white; 
          font-weight: bold; 
        }
        tr:nth-child(even) { 
          background-color: #f9fafb; 
        }
        @media print {
          body { 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${safeEventName}</h1>
        <p>${safeEventDate}</p>
        <p class="summary">${safeGroups.length} Groups — ${totalPlayers} Players</p>
        <p class="produced-by">Produced by The Golf Society Hub</p>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 100px; text-align: center;">Tee Time</th>
            <th style="width: 60px; text-align: center;">Group</th>
            <th>Player Name</th>
          </tr>
        </thead>
        <tbody>
          ${groupsHtml}
        </tbody>
      </table>
    </body>
    </html>
  `;
}
