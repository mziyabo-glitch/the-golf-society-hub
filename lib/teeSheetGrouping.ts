/**
 * Tee Sheet Grouping Utility
 *
 * Groups players into balanced groups for golf rounds.
 * - Max 4 players per group
 * - Avoids singles where possible
 * - Sorts by Handicap Index (descending, nulls last)
 *
 * Examples:
 * - 5 players => [3, 2] or [2, 3]
 * - 6 players => [3, 3] or [4, 2]
 * - 7 players => [4, 3]
 * - 8 players => [4, 4]
 * - 9 players => [4, 3, 2] or [3, 3, 3]
 *
 * Algorithm:
 * 1. Create as many 4-balls as possible
 * 2. Handle remainder:
 *    - 0: Perfect 4-balls
 *    - 1: Convert one 4-ball to 3+2 (avoid single)
 *    - 2: Add a 2-ball
 *    - 3: Add a 3-ball
 */

export type GroupedPlayer = {
  id: string;
  name: string;
  handicapIndex: number | null;
  courseHandicap: number | null;
  playingHandicap: number | null;
};

export type PlayerGroup = {
  groupNumber: number;
  players: GroupedPlayer[];
  teeTime?: string | null;
};

/**
 * Sort players by Handicap Index descending (nulls last)
 * This ensures similar skill levels are grouped together
 */
export function sortPlayersByHandicap<T extends { handicapIndex: number | null }>(
  players: T[]
): T[] {
  return [...players].sort((a, b) => {
    // Nulls go last
    if (a.handicapIndex == null && b.handicapIndex == null) return 0;
    if (a.handicapIndex == null) return 1;
    if (b.handicapIndex == null) return -1;

    // Sort descending (higher handicap first - they typically play earlier)
    return b.handicapIndex - a.handicapIndex;
  });
}

/**
 * Calculate optimal group sizes to avoid singles
 *
 * @param totalPlayers - Total number of players
 * @returns Array of group sizes
 */
export function calculateGroupSizes(totalPlayers: number): number[] {
  if (totalPlayers <= 0) return [];
  if (totalPlayers === 1) return [1]; // Unavoidable single
  if (totalPlayers === 2) return [2];
  if (totalPlayers === 3) return [3];
  if (totalPlayers === 4) return [4];
  if (totalPlayers === 5) return [3, 2]; // Avoid single: 5 = 3+2

  // For 6+, use algorithm
  const fullFourballs = Math.floor(totalPlayers / 4);
  const remainder = totalPlayers % 4;

  const sizes: number[] = [];

  switch (remainder) {
    case 0:
      // Perfect 4-balls
      for (let i = 0; i < fullFourballs; i++) {
        sizes.push(4);
      }
      break;

    case 1:
      // Convert one 4-ball to 3+2 to avoid single
      // e.g., 9 players: 4+4+1 becomes 4+3+2
      for (let i = 0; i < fullFourballs - 1; i++) {
        sizes.push(4);
      }
      sizes.push(3);
      sizes.push(2);
      break;

    case 2:
      // Add a 2-ball
      for (let i = 0; i < fullFourballs; i++) {
        sizes.push(4);
      }
      sizes.push(2);
      break;

    case 3:
      // Add a 3-ball
      for (let i = 0; i < fullFourballs; i++) {
        sizes.push(4);
      }
      sizes.push(3);
      break;
  }

  return sizes;
}

/**
 * Group players into balanced groups
 *
 * @param players - Array of players with handicap info
 * @param sortByHandicap - Whether to sort by handicap before grouping (default true)
 * @returns Array of player groups
 */
export function groupPlayers<T extends GroupedPlayer>(
  players: T[],
  sortByHandicap: boolean = true
): PlayerGroup[] {
  if (players.length === 0) return [];

  // Sort players by handicap if requested
  const sortedPlayers = sortByHandicap ? sortPlayersByHandicap(players) : players;

  // Calculate group sizes
  const groupSizes = calculateGroupSizes(sortedPlayers.length);

  // Create groups
  const groups: PlayerGroup[] = [];
  let playerIndex = 0;

  for (let i = 0; i < groupSizes.length; i++) {
    const size = groupSizes[i];
    const groupPlayers = sortedPlayers.slice(playerIndex, playerIndex + size);

    groups.push({
      groupNumber: i + 1,
      players: groupPlayers,
      teeTime: null,
    });

    playerIndex += size;
  }

  return groups;
}

/**
 * Assign tee times to groups
 *
 * @param groups - Array of player groups
 * @param startTime - Start time as "HH:MM" string
 * @param intervalMinutes - Minutes between tee times (default 10)
 * @returns Groups with tee times assigned
 */
export function assignTeeTimes(
  groups: PlayerGroup[],
  startTime: string,
  intervalMinutes: number = 10
): PlayerGroup[] {
  if (!startTime || groups.length === 0) return groups;

  // Parse start time
  const [hours, minutes] = startTime.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return groups;

  let currentMinutes = hours * 60 + minutes;

  return groups.map((group, index) => {
    const teeHours = Math.floor(currentMinutes / 60);
    const teeMins = currentMinutes % 60;
    const teeTime = `${String(teeHours).padStart(2, "0")}:${String(teeMins).padStart(2, "0")}`;

    currentMinutes += intervalMinutes;

    return {
      ...group,
      teeTime,
    };
  });
}

/**
 * Format hole numbers for display
 * e.g., [3, 7, 14] => "3, 7, 14"
 */
export function formatHoleNumbers(holes: number[] | null | undefined): string {
  if (!holes || holes.length === 0) return "-";
  return holes.sort((a, b) => a - b).join(", ");
}

/**
 * Validate hole numbers (must be 1-18)
 */
export function validateHoleNumbers(holes: number[]): boolean {
  return holes.every((h) => Number.isInteger(h) && h >= 1 && h <= 18);
}

/**
 * Parse hole numbers from comma-separated string
 * e.g., "3, 7, 14" => [3, 7, 14]
 */
export function parseHoleNumbers(input: string): number[] {
  if (!input.trim()) return [];

  const numbers = input
    .split(/[,\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 18);

  // Remove duplicates and sort
  return [...new Set(numbers)].sort((a, b) => a - b);
}
