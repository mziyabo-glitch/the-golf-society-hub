/**
 * Order of Merit (OOM) Calculations
 * Points system for leaderboard rankings
 */

interface Event {
  id: string;
  title: string;
  date: string;
  isOOM?: boolean;
  results?: EventResult[];
}

interface EventResult {
  memberId: string;
  position: number;
  score?: number;
  points?: number;
}

interface Member {
  id: string;
  displayName: string;
  handicap: number;
}

interface OOMEntry {
  memberId: string;
  memberName: string;
  handicap: number;
  totalPoints: number;
  eventsPlayed: number;
  wins: number;
  top3Finishes: number;
  averagePoints: number;
}

/**
 * F1-style points system
 */
const POINTS_MAP: { [position: number]: number } = {
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
 * Get points for a finishing position
 */
export function getPointsForPosition(position: number): number {
  return POINTS_MAP[position] || 0;
}

/**
 * Calculate Order of Merit standings
 */
export function computeOrderOfMerit(params: {
  events: Event[];
  members: Member[];
  seasonYear?: number;
  oomOnly?: boolean;
}): OOMEntry[] {
  const { events, members, seasonYear, oomOnly = false } = params;

  // Filter events
  let filteredEvents = events;

  if (seasonYear) {
    filteredEvents = filteredEvents.filter((event) => {
      const eventYear = new Date(event.date).getFullYear();
      return eventYear === seasonYear;
    });
  }

  if (oomOnly) {
    filteredEvents = filteredEvents.filter((event) => event.isOOM === true);
  }

  // Initialize OOM entries
  const oomMap = new Map<string, OOMEntry>();

  members.forEach((member) => {
    oomMap.set(member.id, {
      memberId: member.id,
      memberName: member.displayName,
      handicap: member.handicap,
      totalPoints: 0,
      eventsPlayed: 0,
      wins: 0,
      top3Finishes: 0,
      averagePoints: 0,
    });
  });

  // Calculate points from events
  filteredEvents.forEach((event) => {
    if (!event.results || event.results.length === 0) return;

    event.results.forEach((result) => {
      const entry = oomMap.get(result.memberId);
      if (!entry) return;

      const points = result.points || getPointsForPosition(result.position);

      entry.totalPoints += points;
      entry.eventsPlayed += 1;

      if (result.position === 1) {
        entry.wins += 1;
      }

      if (result.position <= 3) {
        entry.top3Finishes += 1;
      }
    });
  });

  // Calculate averages and convert to array
  const oomEntries = Array.from(oomMap.values()).map((entry) => ({
    ...entry,
    averagePoints: entry.eventsPlayed > 0 ? entry.totalPoints / entry.eventsPlayed : 0,
  }));

  // Filter out members with no points
  const activeEntries = oomEntries.filter((entry) => entry.totalPoints > 0);

  // Sort by:
  // 1. Total points (descending)
  // 2. Wins (descending)
  // 3. Events played (ascending - fewer events is better if points are equal)
  // 4. Name (alphabetical)
  activeEntries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }
    if (a.eventsPlayed !== b.eventsPlayed) {
      return a.eventsPlayed - b.eventsPlayed;
    }
    return a.memberName.localeCompare(b.memberName);
  });

  return activeEntries;
}

/**
 * Get member's current OOM position
 */
export function getMemberPosition(
  oomEntries: OOMEntry[],
  memberId: string
): number | null {
  const index = oomEntries.findIndex((entry) => entry.memberId === memberId);
  return index >= 0 ? index + 1 : null;
}

/**
 * Get top N members
 */
export function getTopMembers(oomEntries: OOMEntry[], count: number): OOMEntry[] {
  return oomEntries.slice(0, count);
}

/**
 * Check if member is in top 3
 */
export function isInTopThree(oomEntries: OOMEntry[], memberId: string): boolean {
  const position = getMemberPosition(oomEntries, memberId);
  return position !== null && position <= 3;
}

/**
 * Calculate points needed to reach a target position
 */
export function pointsToReach(
  oomEntries: OOMEntry[],
  currentMemberId: string,
  targetPosition: number
): number | null {
  const currentEntry = oomEntries.find((e) => e.memberId === currentMemberId);
  if (!currentEntry) return null;

  const targetEntry = oomEntries[targetPosition - 1];
  if (!targetEntry) return null;

  if (currentEntry.totalPoints >= targetEntry.totalPoints) {
    return 0; // Already ahead
  }

  return targetEntry.totalPoints - currentEntry.totalPoints + 1;
}
