/**
 * Order of Merit (OOM) Computation
 * Single source of truth for calculating leaderboard points and rankings
 */

import type { EventData, MemberData } from "./models";

/**
 * Points mapping by finishing position (F1-style)
 * 1st=25, 2nd=18, 3rd=15, 4th=12, 5th=10, 6th=8, 7th=6, 8th=4, 9th=2, 10th=1
 */
export const OOM_POINTS_MAP: Record<number, number> = {
  1: 25,
  2: 18,
  3: 15,
  4: 12,
  5: 10,
  6: 8,
  7: 6,
  8: 4,
  9: 2,
  10: 1,
};

/**
 * Get points for a given position
 */
export function getPointsForPosition(position: number): number {
  return OOM_POINTS_MAP[position] ?? 0;
}

/**
 * OOM Entry for a single member
 */
export type OOMEntry = {
  memberId: string;
  memberName: string;
  handicap?: number;
  totalPoints: number;
  wins: number;
  played: number;
};

/**
 * Event result entry with position
 */
export type EventResultEntry = {
  memberId: string;
  position: number;
  score: number;
  scoreType: "stableford" | "strokeplay";
};

/**
 * Get year from event date string
 */
export function getEventYear(eventDate: string): number | null {
  if (!eventDate || eventDate.trim() === "") return null;

  try {
    const date = new Date(eventDate);
    if (isNaN(date.getTime())) {
      // Try extracting year from YYYY-MM-DD format directly
      const yearMatch = eventDate.match(/^(\d{4})/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1], 10);
        if (!isNaN(year) && year > 1900 && year < 2100) {
          return year;
        }
      }
      return null;
    }
    return date.getFullYear();
  } catch {
    return null;
  }
}

/**
 * Calculate event leaderboard from results
 * Returns sorted array of entries with positions
 * 
 * DEFENSIVE: Never throws, always returns empty array on invalid input
 */
export function calculateEventLeaderboard(event: EventData): EventResultEntry[] {
  try {
    // Defensive guards
    if (!event) {
      return [];
    }
    
    if (!event.results || typeof event.results !== "object") {
      return [];
    }
    
    if (Object.keys(event.results).length === 0) {
      return [];
    }

  // Determine scoring type based on event format and available data
  const entries: Array<{ memberId: string; score: number; scoreType: "stableford" | "strokeplay" }> = [];

  // Safe iteration over results object
  const resultsObj = event.results || {};
  Object.entries(resultsObj).forEach(([memberId, result]) => {
    if (!result || !memberId) return;

    // Prefer stableford for Stableford/Both formats, otherwise use strokeplay/grossScore
    if ((event.format === "Stableford" || event.format === "Both") && result.stableford !== undefined) {
      entries.push({ memberId, score: result.stableford, scoreType: "stableford" });
    } else if (result.strokeplay !== undefined) {
      entries.push({ memberId, score: result.strokeplay, scoreType: "strokeplay" });
    } else if (result.grossScore !== undefined) {
      entries.push({ memberId, score: result.grossScore, scoreType: "strokeplay" });
    }
  });

  if (entries.length === 0) return [];

  // Sort: Stableford = highest wins, Strokeplay = lowest wins
  const isStableford = entries[0]?.scoreType === "stableford";
  entries.sort((a, b) => {
    if (isStableford) {
      return b.score - a.score; // Higher is better
    } else {
      return a.score - b.score; // Lower is better
    }
  });

  // Assign positions
  return entries.map((entry, index) => ({
    memberId: entry.memberId,
    position: index + 1,
    score: entry.score,
    scoreType: entry.scoreType,
  }));
  } catch (error) {
    // Never crash - return empty array on error
    if (__DEV__) {
      console.error("[OOM] calculateEventLeaderboard error:", error);
    }
    return [];
  }
}

/**
 * Options for computing Order of Merit
 */
export type ComputeOOMOptions = {
  events: EventData[];
  members: MemberData[];
  seasonYear?: number;
  oomOnly?: boolean; // If true, only count events with isOOM=true
};

/**
 * Compute Order of Merit leaderboard
 * Returns only members with totalPoints > 0, sorted by:
 * 1. Points desc
 * 2. Wins desc
 * 3. Played asc (fewer events = better efficiency)
 * 4. Name asc (alphabetical tiebreaker)
 * 
 * DEFENSIVE: Never throws, always returns empty array on invalid input
 */
export function computeOrderOfMerit(options: ComputeOOMOptions): OOMEntry[] {
  try {
    const { events, members, seasonYear, oomOnly = false } = options;

    // Defensive guards - ensure we have valid arrays
    if (!events || !Array.isArray(events)) {
      if (__DEV__) {
        console.log("[OOM] computeOrderOfMerit: events is not an array");
      }
      return [];
    }
    
    if (!members || !Array.isArray(members)) {
      if (__DEV__) {
        console.log("[OOM] computeOrderOfMerit: members is not an array");
      }
      return [];
    }

    // Filter to published events only (with null check)
    let filteredEvents = events.filter((e) => e && e.resultsStatus === "published");

  // Filter by season year if specified
  if (seasonYear !== undefined) {
    filteredEvents = filteredEvents.filter((e) => {
      const year = getEventYear(e.date);
      return year === seasonYear;
    });
  }

  // Filter to OOM events only if specified
  if (oomOnly) {
    filteredEvents = filteredEvents.filter((e) => e.isOOM === true);
  }

  // Build member stats
  const memberStats: Record<string, { points: number; wins: number; played: number }> = {};

  // Initialize stats for all members
  members.forEach((member) => {
    if (member?.id) {
      memberStats[member.id] = { points: 0, wins: 0, played: 0 };
    }
  });

  // Process each event
  filteredEvents.forEach((event) => {
    const leaderboard = calculateEventLeaderboard(event);

    leaderboard.forEach((entry) => {
      if (!memberStats[entry.memberId]) {
        // Member not in members list (might be guest or removed member)
        memberStats[entry.memberId] = { points: 0, wins: 0, played: 0 };
      }

      const stats = memberStats[entry.memberId];
      stats.points += getPointsForPosition(entry.position);
      stats.played += 1;

      if (entry.position === 1) {
        stats.wins += 1;
      }
    });
  });

  // Build member lookup for names
  const memberLookup = new Map<string, MemberData>();
  members.forEach((m) => {
    if (m?.id) {
      memberLookup.set(m.id, m);
    }
  });

  // Convert to OOMEntry array
  const entries: OOMEntry[] = Object.entries(memberStats)
    .map(([memberId, stats]) => {
      const member = memberLookup.get(memberId);
      return {
        memberId,
        memberName: member?.name ?? "Unknown",
        handicap: member?.handicap,
        totalPoints: stats.points,
        wins: stats.wins,
        played: stats.played,
      };
    })
    // Filter to only members with points > 0
    .filter((entry) => entry.totalPoints > 0);

  // Sort: points desc, wins desc, played asc, name asc
  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }
    if (a.played !== b.played) {
      return a.played - b.played; // Fewer events = better efficiency
    }
    return (a.memberName || "").localeCompare(b.memberName || "");
  });

  return entries;
  } catch (error) {
    // Never crash - return empty array on error
    if (__DEV__) {
      console.error("[OOM] computeOrderOfMerit error:", error);
    }
    return [];
  }
}

/**
 * Generate HTML for OOM PDF export
 */
export function generateOOMHtml(options: {
  entries: OOMEntry[];
  societyName: string;
  seasonYear: number;
  logoUrl?: string | null;
  oomOnly?: boolean;
}): string {
  const { entries, societyName, seasonYear, logoUrl, oomOnly } = options;

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="Society Logo" style="max-width: 100px; max-height: 100px; margin-bottom: 15px;" />`
    : "";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Order of Merit - ${societyName}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          font-size: 14px; 
          padding: 20px; 
          max-width: 800px; 
          margin: 0 auto;
        }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { margin: 10px 0; font-size: 24px; font-weight: bold; }
        .header p { margin: 5px 0; font-size: 14px; color: #666; }
        .produced-by { font-size: 10px; color: #999; margin-top: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #000; padding: 10px; text-align: left; }
        th { background-color: #0B6E4F; color: white; font-weight: bold; }
        .position { text-align: center; font-weight: bold; width: 60px; }
        .points { text-align: center; font-weight: bold; }
        .wins, .played { text-align: center; }
        .gold { background-color: #fbbf24; color: #000; }
        .silver { background-color: #9ca3af; color: #000; }
        .bronze { background-color: #cd7f32; color: #000; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${logoHtml}
        <h1>${oomOnly ? "Order of Merit" : "Season Leaderboard"}</h1>
        <p>${societyName} — ${seasonYear}</p>
        <p class="produced-by">Produced by The Golf Society Hub</p>
      </div>
      <table>
        <thead>
          <tr>
            <th class="position">Pos</th>
            <th>Member</th>
            <th class="points">Points</th>
            <th class="wins">Wins</th>
            <th class="played">Played</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(
              (entry, index) => `
            <tr>
              <td class="position ${index === 0 ? "gold" : index === 1 ? "silver" : index === 2 ? "bronze" : ""}">${index + 1}</td>
              <td>${entry.memberName}${entry.handicap !== undefined ? ` (HCP: ${entry.handicap})` : ""}</td>
              <td class="points">${entry.totalPoints}</td>
              <td class="wins">${entry.wins}</td>
              <td class="played">${entry.played}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </body>
    </html>
  `;
}
