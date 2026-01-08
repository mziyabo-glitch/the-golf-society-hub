/**
 * Stress Test Script for Golf Society Hub
 * 
 * Simulates:
 * - 100 societies (conceptually)
 * - 20 members each
 * - 12 events each with random results
 * 
 * Tests that OOM computation completes quickly without crashing.
 * 
 * Usage:
 *   npx ts-node scripts/stress-test.ts
 *   # or
 *   npx tsx scripts/stress-test.ts
 */

// Mock types matching lib/models.ts
type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  sex?: "male" | "female";
  roles?: string[];
};

type EventData = {
  id: string;
  name: string;
  date: string;
  courseName: string;
  format: "Stableford" | "Strokeplay" | "Both";
  resultsStatus?: "draft" | "published";
  isOOM?: boolean;
  results?: {
    [memberId: string]: {
      grossScore: number;
      stableford?: number;
      strokeplay?: number;
    };
  };
};

// Import OOM computation (inline version for standalone execution)
const OOM_POINTS_MAP: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
};

function getPointsForPosition(position: number): number {
  return OOM_POINTS_MAP[position] ?? 0;
}

type OOMEntry = {
  memberId: string;
  memberName: string;
  totalPoints: number;
  wins: number;
  played: number;
};

function calculateEventLeaderboard(event: EventData): Array<{ memberId: string; position: number }> {
  if (!event?.results || Object.keys(event.results).length === 0) return [];

  const entries = Object.entries(event.results).map(([memberId, result]) => ({
    memberId,
    score: result.stableford ?? result.grossScore ?? 0,
  }));

  // Sort by stableford (higher is better) if available
  const isStableford = event.format === "Stableford" || event.format === "Both";
  entries.sort((a, b) => isStableford ? b.score - a.score : a.score - b.score);

  return entries.map((entry, index) => ({ memberId: entry.memberId, position: index + 1 }));
}

function computeOrderOfMerit(options: {
  events: EventData[];
  members: MemberData[];
  seasonYear?: number;
  oomOnly?: boolean;
}): OOMEntry[] {
  const { events, members, seasonYear, oomOnly = false } = options;

  if (!Array.isArray(events) || !Array.isArray(members)) return [];

  let filteredEvents = events.filter((e) => e?.resultsStatus === "published");

  if (seasonYear !== undefined) {
    filteredEvents = filteredEvents.filter((e) => {
      const match = e.date?.match(/^(\d{4})/);
      return match && parseInt(match[1], 10) === seasonYear;
    });
  }

  if (oomOnly) {
    filteredEvents = filteredEvents.filter((e) => e.isOOM === true);
  }

  const memberStats: Record<string, { points: number; wins: number; played: number }> = {};

  members.forEach((m) => {
    if (m?.id) memberStats[m.id] = { points: 0, wins: 0, played: 0 };
  });

  filteredEvents.forEach((event) => {
    const leaderboard = calculateEventLeaderboard(event);
    leaderboard.forEach((entry) => {
      if (!memberStats[entry.memberId]) {
        memberStats[entry.memberId] = { points: 0, wins: 0, played: 0 };
      }
      memberStats[entry.memberId].points += getPointsForPosition(entry.position);
      memberStats[entry.memberId].played += 1;
      if (entry.position === 1) memberStats[entry.memberId].wins += 1;
    });
  });

  const memberLookup = new Map<string, MemberData>();
  members.forEach((m) => m?.id && memberLookup.set(m.id, m));

  const entries: OOMEntry[] = Object.entries(memberStats)
    .map(([memberId, stats]) => ({
      memberId,
      memberName: memberLookup.get(memberId)?.name ?? "Unknown",
      totalPoints: stats.points,
      wins: stats.wins,
      played: stats.played,
    }))
    .filter((e) => e.totalPoints > 0);

  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.played !== b.played) return a.played - b.played;
    return a.memberName.localeCompare(b.memberName);
  });

  return entries;
}

// ============ Test Data Generation ============

function generateMember(index: number): MemberData {
  const firstNames = ["John", "Sarah", "Mike", "Emma", "Chris", "Lisa", "David", "Amy", "James", "Kate"];
  const lastNames = ["Smith", "Jones", "Brown", "Wilson", "Taylor", "Davies", "Evans", "Thomas", "Johnson", "Roberts"];
  
  return {
    id: `member-${index}`,
    name: `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`,
    handicap: Math.floor(Math.random() * 36),
    sex: index % 5 === 0 ? "female" : "male",
    roles: index === 0 ? ["captain", "member"] : ["member"],
  };
}

function generateEvent(index: number, members: MemberData[], year: number): EventData {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIndex = index % 12;
  
  // Generate results for random subset of members
  const participantCount = Math.floor(members.length * 0.6) + Math.floor(Math.random() * (members.length * 0.4));
  const shuffled = [...members].sort(() => Math.random() - 0.5);
  const participants = shuffled.slice(0, participantCount);
  
  const results: EventData["results"] = {};
  participants.forEach((member) => {
    // Stableford scores typically 20-45
    results[member.id] = {
      grossScore: 70 + Math.floor(Math.random() * 30),
      stableford: 20 + Math.floor(Math.random() * 25),
    };
  });
  
  return {
    id: `event-${index}`,
    name: `${months[monthIndex]} Medal ${year}`,
    date: `${year}-${String(monthIndex + 1).padStart(2, "0")}-15`,
    courseName: "Test Golf Club",
    format: "Stableford",
    resultsStatus: "published",
    isOOM: index % 2 === 0, // Half are OOM events
    results,
  };
}

// ============ Run Tests ============

console.log("=".repeat(60));
console.log("Golf Society Hub - Stress Test");
console.log("=".repeat(60));

const NUM_SOCIETIES = 100;
const MEMBERS_PER_SOCIETY = 20;
const EVENTS_PER_SOCIETY = 12;
const CURRENT_YEAR = new Date().getFullYear();

console.log(`\nSimulating ${NUM_SOCIETIES} societies...`);
console.log(`  - ${MEMBERS_PER_SOCIETY} members each`);
console.log(`  - ${EVENTS_PER_SOCIETY} events each with random results`);
console.log(`  - Total: ${NUM_SOCIETIES * MEMBERS_PER_SOCIETY} members, ${NUM_SOCIETIES * EVENTS_PER_SOCIETY} events\n`);

const startTime = performance.now();
let totalOOMEntries = 0;
let maxOOMTime = 0;
let errorCount = 0;

for (let s = 0; s < NUM_SOCIETIES; s++) {
  try {
    // Generate members for this society
    const members: MemberData[] = [];
    for (let m = 0; m < MEMBERS_PER_SOCIETY; m++) {
      members.push(generateMember(m));
    }
    
    // Generate events for this society
    const events: EventData[] = [];
    for (let e = 0; e < EVENTS_PER_SOCIETY; e++) {
      events.push(generateEvent(e, members, CURRENT_YEAR));
    }
    
    // Compute OOM
    const oomStart = performance.now();
    const oomResult = computeOrderOfMerit({
      events,
      members,
      seasonYear: CURRENT_YEAR,
      oomOnly: false,
    });
    const oomEnd = performance.now();
    const oomTime = oomEnd - oomStart;
    
    if (oomTime > maxOOMTime) maxOOMTime = oomTime;
    totalOOMEntries += oomResult.length;
    
    // Also test OOM-only filter
    const oomOnlyResult = computeOrderOfMerit({
      events,
      members,
      seasonYear: CURRENT_YEAR,
      oomOnly: true,
    });
    
    // Verify results make sense
    if (oomResult.length === 0 && events.some(e => e.resultsStatus === "published")) {
      console.warn(`  Society ${s + 1}: No OOM entries despite published events`);
    }
    
    // Progress indicator
    if ((s + 1) % 10 === 0) {
      console.log(`  Processed ${s + 1}/${NUM_SOCIETIES} societies...`);
    }
  } catch (error) {
    errorCount++;
    console.error(`  ERROR in society ${s + 1}:`, error);
  }
}

const endTime = performance.now();
const totalTime = endTime - startTime;

console.log("\n" + "=".repeat(60));
console.log("Results:");
console.log("=".repeat(60));
console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
console.log(`  Average per society: ${(totalTime / NUM_SOCIETIES).toFixed(2)}ms`);
console.log(`  Max OOM computation time: ${maxOOMTime.toFixed(2)}ms`);
console.log(`  Total OOM entries generated: ${totalOOMEntries}`);
console.log(`  Errors: ${errorCount}`);

// Performance assertions
const ACCEPTABLE_TOTAL_TIME = 5000; // 5 seconds max
const ACCEPTABLE_PER_SOCIETY = 50; // 50ms max per society

if (totalTime > ACCEPTABLE_TOTAL_TIME) {
  console.error(`\n❌ FAIL: Total time ${totalTime.toFixed(0)}ms exceeds ${ACCEPTABLE_TOTAL_TIME}ms`);
  process.exit(1);
}

if (maxOOMTime > ACCEPTABLE_PER_SOCIETY) {
  console.error(`\n❌ FAIL: Max OOM time ${maxOOMTime.toFixed(0)}ms exceeds ${ACCEPTABLE_PER_SOCIETY}ms`);
  process.exit(1);
}

if (errorCount > 0) {
  console.error(`\n❌ FAIL: ${errorCount} errors occurred`);
  process.exit(1);
}

console.log("\n✅ PASS: All stress tests completed successfully");
console.log("=".repeat(60));
