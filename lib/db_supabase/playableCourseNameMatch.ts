/** Normalize for comparing round display names to `courses.course_name` / `courses.club_name`. */
export function normalizePlayableCourseNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/golf club/g, "")
    .replace(/golf centre/g, "")
    .replace(/golf center/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** How well a single normalized label (course_name or club_name) matches the round name key. */
export function normalizedLabelMatchScore(targetKey: string, labelKey: string): number {
  if (!labelKey) return 0;
  if (labelKey === targetKey) return 100;
  if (targetKey.length >= 4 && (labelKey.includes(targetKey) || targetKey.includes(labelKey))) return 40;
  const tokens = targetKey.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => labelKey.includes(t)).length;
  return Math.round((hits / tokens.length) * 30);
}
