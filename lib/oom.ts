/**
 * Order of Merit (OOM) Computation
 * Single source of truth for calculating leaderboard points and rankings
 */

import type { EventData, MemberData } from "./models";

// ============================================================================
// SAFE COERCION HELPERS - Prevent .trim() on non-strings
// ============================================================================

/**
 * Safely convert any value to a trimmed string.
 * Prevents "e.trim is not a function" errors.
 */
export function toTrimmedString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value === null || value === undefined) {
    return "";
  }
  // Handle Firestore Timestamps and Date objects
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return "";
    }
  }
  return String(value).trim();
}

/**
 * Safely convert any value to a number.
 * Returns fallback if value is not a finite number.
 */
export function toNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const str = toTrimmedString(value);
  if (str === "") {
    return fallback;
  }
  const n = Number(str);
  return Number.isFinite(n) ? n : fallback;
}

// ============================================================================
// POINTS MAPPING
// ============================================================================

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
 * Get year from event date (string, Date, or Firestore Timestamp).
 * Uses safe coercion to prevent crashes on non-string values.
 */
export function getEventYear(eventDate: unknown): number | null {
  try {
    // Use safe coercion to get a string representation
    const dateStr = toTrimmedString(eventDate);
    if (!dateStr) return null;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // Try extracting year from YYYY-MM-DD format directly
      const yearMatch = dateStr.match(/^(\d{4})/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1], 10);
        if (!isNaN(year) && year > 1900 && year < 2100) {
          return year;
        }
      }
      return null;
    }
    return date.getFullYear();
  } catch (error) {
    if (__DEV__) {
      console.error("[OOM] getEventYear error:", error, { eventDateType: typeof eventDate });
    }
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
    
    // Get safe event ID for logging
    const eventId = toTrimmedString(event.id) || "unknown-event";
    
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
      // Skip entries without valid memberId
      const safeMemberId = toTrimmedString(memberId);
      if (!safeMemberId || !result) {
        if (__DEV__) {
          console.warn("[OOM] Skipping result row with missing memberId", { eventId, memberIdType: typeof memberId });
        }
        return;
      }

      // Use safe number coercion for scores
      if ((event.format === "Stableford" || event.format === "Both") && result.stableford !== undefined) {
        entries.push({ memberId: safeMemberId, score: toNumber(result.stableford, 0), scoreType: "stableford" });
      } else if (result.strokeplay !== undefined) {
        entries.push({ memberId: safeMemberId, score: toNumber(result.strokeplay, 0), scoreType: "strokeplay" });
      } else if (result.grossScore !== undefined) {
        entries.push({ memberId: safeMemberId, score: toNumber(result.grossScore, 0), scoreType: "strokeplay" });
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
    console.error("[OOM] calculateEventLeaderboard error:", error, {
      eventId: event?.id,
      eventIdType: typeof event?.id,
      hasResults: !!event?.results,
    });
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
        console.log("[OOM] computeOrderOfMerit: events is not an array", { eventsType: typeof events });
      }
      return [];
    }
    
    if (!members || !Array.isArray(members)) {
      if (__DEV__) {
        console.log("[OOM] computeOrderOfMerit: members is not an array", { membersType: typeof members });
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

    // Initialize stats for all members - skip entries without valid ID
    members.forEach((member) => {
      const safeMemberId = toTrimmedString(member?.id);
      if (safeMemberId) {
        memberStats[safeMemberId] = { points: 0, wins: 0, played: 0 };
      }
    });

    // Process each event
    filteredEvents.forEach((event) => {
      const leaderboard = calculateEventLeaderboard(event);

      leaderboard.forEach((entry) => {
        // Use safe member ID coercion
        const safeMemberId = toTrimmedString(entry.memberId);
        if (!safeMemberId) {
          if (__DEV__) {
            console.warn("[OOM] Skipping entry with missing memberId in event", { eventId: event?.id });
          }
          return;
        }
        
        if (!memberStats[safeMemberId]) {
          // Member not in members list (might be guest or removed member)
          memberStats[safeMemberId] = { points: 0, wins: 0, played: 0 };
        }

        const stats = memberStats[safeMemberId];
        stats.points += toNumber(getPointsForPosition(entry.position), 0);
        stats.played += 1;

        if (entry.position === 1) {
          stats.wins += 1;
        }
      });
    });

    // Build member lookup for names
    const memberLookup = new Map<string, MemberData>();
    members.forEach((m) => {
      const safeMemberId = toTrimmedString(m?.id);
      if (safeMemberId) {
        memberLookup.set(safeMemberId, m);
      }
    });

    // Convert to OOMEntry array
    const entries: OOMEntry[] = Object.entries(memberStats)
      .filter(([memberId]) => {
        // Skip entries with invalid member ID
        return toTrimmedString(memberId).length > 0;
      })
      .map(([memberId, stats]) => {
        const safeMemberId = toTrimmedString(memberId);
        const member = memberLookup.get(safeMemberId);
        const memberName = toTrimmedString(member?.name) || "Unknown Member";
        return {
          memberId: safeMemberId,
          memberName,
          handicap: member?.handicap !== undefined ? toNumber(member.handicap) : undefined,
          totalPoints: toNumber(stats.points, 0),
          wins: toNumber(stats.wins, 0),
          played: toNumber(stats.played, 0),
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
    console.error("[OOM] computeOrderOfMerit error:", error, {
      eventsCount: options?.events?.length,
      membersCount: options?.members?.length,
      seasonYear: options?.seasonYear,
    });
    return [];
  }
}

/**
 * Generate HTML for OOM PDF export
 * Uses safe coercion to prevent crashes from missing/invalid data.
 */
export function generateOOMHtml(options: {
  entries: OOMEntry[];
  societyName: string;
  seasonYear: number;
  logoUrl?: string | null;
  oomOnly?: boolean;
}): string {
  try {
    const { entries, societyName, seasonYear, logoUrl, oomOnly } = options;
    
    // Safe values for template
    const safeSocietyName = toTrimmedString(societyName) || "Golf Society";
    const safeSeasonYear = toNumber(seasonYear, new Date().getFullYear());
    const safeEntries = Array.isArray(entries) ? entries : [];

    const logoHtml = logoUrl
      ? `<img src="${toTrimmedString(logoUrl)}" alt="Society Logo" style="max-width: 100px; max-height: 100px; margin-bottom: 15px;" />`
      : "";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Order of Merit - ${safeSocietyName}</title>
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
          <p>${safeSocietyName} — ${safeSeasonYear}</p>
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
            ${safeEntries
              .map((entry, index) => {
                const safeMemberName = toTrimmedString(entry?.memberName) || "Unknown Member";
                const safePoints = toNumber(entry?.totalPoints, 0);
                const safeWins = toNumber(entry?.wins, 0);
                const safePlayed = toNumber(entry?.played, 0);
                const handicapStr = entry?.handicap !== undefined ? ` (HCP: ${toNumber(entry.handicap, 0)})` : "";
                
                return `
              <tr>
                <td class="position ${index === 0 ? "gold" : index === 1 ? "silver" : index === 2 ? "bronze" : ""}">${index + 1}</td>
                <td>${safeMemberName}${handicapStr}</td>
                <td class="points">${safePoints}</td>
                <td class="wins">${safeWins}</td>
                <td class="played">${safePlayed}</td>
              </tr>
            `;
              })
              .join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;
  } catch (error) {
    console.error("[OOM] generateOOMHtml error:", error);
    // Return a minimal valid HTML on error
    return `<!DOCTYPE html><html><body><p>Error generating leaderboard. Please try again.</p></body></html>`;
  }
}
