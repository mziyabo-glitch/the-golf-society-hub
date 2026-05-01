/**
 * Strict Free Play / scorecard-ready rules: one **active** tee must carry ratings,
 * holes 1–18 with par, and stroke indices 1–18 with no duplicates.
 * Used by unit tests and kept in sync with `search_scorecard_ready_courses` (migration 156).
 */

export type ScorecardReadyTeeInput = {
  is_active?: boolean | null;
  course_rating: number | null;
  slope_rating: number | null;
  par_total: number | null;
};

export type ScorecardReadyHoleInput = {
  hole_number: number;
  par: number | null;
  stroke_index: number | null;
};

export function isTeeActiveForScoring(row: ScorecardReadyTeeInput): boolean {
  return row.is_active !== false;
}

export function teeHasRatingBlock(row: ScorecardReadyTeeInput): boolean {
  return (
    row.course_rating != null &&
    Number.isFinite(Number(row.course_rating)) &&
    Number(row.course_rating) > 0 &&
    row.slope_rating != null &&
    Number.isFinite(Number(row.slope_rating)) &&
    Number(row.slope_rating) > 0 &&
    row.par_total != null &&
    Number.isFinite(Number(row.par_total)) &&
    Number(row.par_total) > 0
  );
}

/**
 * True when this tee row + its holes satisfy the strict same-tee scorecard-ready definition.
 */
export function strictScorecardReadyForTee(tee: ScorecardReadyTeeInput, holeRows: ScorecardReadyHoleInput[]): boolean {
  if (!isTeeActiveForScoring(tee) || !teeHasRatingBlock(tee)) return false;
  const byN = new Map<number, ScorecardReadyHoleInput>();
  for (const h of holeRows) {
    if (!byN.has(h.hole_number)) byN.set(h.hole_number, h);
  }
  const sis: number[] = [];
  for (let n = 1; n <= 18; n++) {
    const h = byN.get(n);
    if (!h) return false;
    if (!(Number.isFinite(Number(h.par)) && Number(h.par) > 0)) return false;
    const si = Number(h.stroke_index);
    if (!Number.isFinite(si) || !Number.isInteger(si) || si < 1 || si > 18) return false;
    sis.push(si);
  }
  return new Set(sis).size === 18;
}

export function courseHasStrictScorecardReadyActiveTee(
  tees: (ScorecardReadyTeeInput & { id: string })[],
  holesByTeeId: Map<string, ScorecardReadyHoleInput[]>,
): boolean {
  for (const t of tees) {
    if (!isTeeActiveForScoring(t)) continue;
    const rows = holesByTeeId.get(t.id) ?? [];
    if (strictScorecardReadyForTee(t, rows)) return true;
  }
  return false;
}

/** Normalized display name key (matches catalog audit / Free Play duplicate exclusion). */
export function normalizeCourseDisplayNameKey(courseName: string | null | undefined, clubName: string | null | undefined): string {
  const disp =
    String(courseName ?? "")
      .trim()
      .replace(/\s+/g, " ") ||
    String(clubName ?? "")
      .trim()
      .replace(/\s+/g, " ") ||
    "(no name)";
  return disp.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True if another course shares the same normalized display key. */
export function isDuplicateDisplayNameCourse(courseId: string, idsByNormalizedKey: Map<string, string[]>): boolean {
  for (const ids of idsByNormalizedKey.values()) {
    if (ids.length > 1 && ids.includes(courseId)) return true;
  }
  return false;
}

/**
 * Default Free Play search: strict-ready on at least one active tee and not in a duplicate-name group.
 */
export function courseEligibleForFreePlayScorecardSearch(
  courseId: string,
  tees: (ScorecardReadyTeeInput & { id: string })[],
  holesByTeeId: Map<string, ScorecardReadyHoleInput[]>,
  idsByNormalizedKey: Map<string, string[]>,
): boolean {
  if (isDuplicateDisplayNameCourse(courseId, idsByNormalizedKey)) return false;
  return courseHasStrictScorecardReadyActiveTee(tees, holesByTeeId);
}
