/**
 * Order of Merit (OOM) F1 points are allocated among **society members only**.
 * Official field position (Pos) can include guests; OOM column is always 0 for guests.
 *
 * @see app/(app)/event/[id]/points.tsx — primary consumer when saving `event_results`.
 */

export type OomFieldSortOrder = "high_wins" | "low_wins";

const F1_OOM_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export function getOOMPointsForPosition(position: number): number {
  if (position >= 1 && position <= 10) {
    return F1_OOM_POINTS[position - 1]!;
  }
  return 0;
}

/** Tie block: share the sum of F1 slots [start, start+tieCount) equally. */
export function getAveragedOOMPoints(startPosition: number, tieCount: number): number {
  if (tieCount <= 0) return 0;
  let totalPoints = 0;
  for (let i = 0; i < tieCount; i++) {
    totalPoints += getOOMPointsForPosition(startPosition + i);
  }
  return totalPoints / tieCount;
}

export function isGuestEntrantKey(memberId: string): boolean {
  return String(memberId).startsWith("guest-");
}

function hasValidDayPoints(dayPoints: string): boolean {
  const t = dayPoints.trim();
  if (t === "") return false;
  return !isNaN(parseInt(t, 10));
}

function compareDayValue(a: string, b: string, sortOrder: OomFieldSortOrder): number {
  const aPts = parseInt(a.trim(), 10);
  const bPts = parseInt(b.trim(), 10);
  if (sortOrder === "low_wins") {
    return aPts - bPts;
  }
  return bPts - aPts;
}

/**
 * Assigns:
 * - `position`: finishing place in the **full field** (members + guests), ties share start rank.
 * - `oomPoints`: F1 OOM points from **member-only** ranking (guests always 0).
 */
export function calculateFieldPositionsAndMemberOomPoints<T extends { memberId: string; dayPoints: string }>(
  playerList: T[],
  sortOrder: OomFieldSortOrder,
): Array<T & { position: number | null; oomPoints: number }> {
  const withPoints: T[] = [];
  const withoutPoints: T[] = [];

  for (const p of playerList) {
    if (hasValidDayPoints(p.dayPoints)) {
      withPoints.push(p);
    } else {
      withoutPoints.push(p);
    }
  }

  withPoints.sort((a, b) => compareDayValue(a.dayPoints, b.dayPoints, sortOrder));

  const positioned: Array<T & { position: number; oomPoints: number }> = [];
  let currentPosition = 1;
  let i = 0;

  while (i < withPoints.length) {
    const currentDayValue = parseInt(withPoints[i]!.dayPoints.trim(), 10);
    let tieCount = 1;
    while (
      i + tieCount < withPoints.length &&
      parseInt(withPoints[i + tieCount]!.dayPoints.trim(), 10) === currentDayValue
    ) {
      tieCount++;
    }

    for (let j = 0; j < tieCount; j++) {
      positioned.push({
        ...withPoints[i + j]!,
        position: currentPosition,
        oomPoints: 0,
      });
    }

    currentPosition += tieCount;
    i += tieCount;
  }

  const membersInFieldOrder = positioned.filter((p) => !isGuestEntrantKey(p.memberId));
  const oomByMemberId = new Map<string, number>();
  let memberRank = 1;
  let mi = 0;
  while (mi < membersInFieldOrder.length) {
    const currentDayValue = parseInt(membersInFieldOrder[mi]!.dayPoints.trim(), 10);
    let tieCount = 1;
    while (
      mi + tieCount < membersInFieldOrder.length &&
      parseInt(membersInFieldOrder[mi + tieCount]!.dayPoints.trim(), 10) === currentDayValue
    ) {
      tieCount++;
    }
    const averaged = getAveragedOOMPoints(memberRank, tieCount);
    for (let j = 0; j < tieCount; j++) {
      oomByMemberId.set(membersInFieldOrder[mi + j]!.memberId, averaged);
    }
    memberRank += tieCount;
    mi += tieCount;
  }

  const merged: Array<T & { position: number | null; oomPoints: number }> = positioned.map((p) => ({
    ...p,
    oomPoints: isGuestEntrantKey(p.memberId) ? 0 : (oomByMemberId.get(p.memberId) ?? 0),
  }));

  const tail = withoutPoints.map((p) => ({
    ...p,
    position: null as number | null,
    oomPoints: 0,
  }));

  return [...merged, ...tail];
}
