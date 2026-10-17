/**
 * Pure helpers for GolfCourseAPI import tee reconciliation (see persistNormalizedCourseImport).
 * DB rows keyed by (course_id, tee_name); normalized import is the source of truth for active tees.
 */

export type CourseTeeNameRow = { id: string; tee_name: string };

/** Tee rows whose tee_name is not in the current normalized import (exact string match, same as upsert key). */
export function listStaleTeeRows(dbTees: CourseTeeNameRow[], normalizedTeeNames: readonly string[]): CourseTeeNameRow[] {
  const keep = new Set(normalizedTeeNames);
  return dbTees.filter((t) => !keep.has(t.tee_name));
}

export type StaleTeePartition = {
  /** Stale tee ids referenced by events / event_courses / event_entries — must soft-deactivate, not delete. */
  deactivateIds: string[];
  /** Stale tee ids with no references — safe to hard-delete (course_holes already cleared for the course). */
  deleteIds: string[];
};

export function partitionStaleTeesForImportReconciliation(
  staleRows: CourseTeeNameRow[],
  referencedTeeIds: ReadonlySet<string>,
): StaleTeePartition {
  const deactivateIds: string[] = [];
  const deleteIds: string[] = [];
  for (const row of staleRows) {
    if (referencedTeeIds.has(row.id)) deactivateIds.push(row.id);
    else deleteIds.push(row.id);
  }
  return { deactivateIds, deleteIds };
}
