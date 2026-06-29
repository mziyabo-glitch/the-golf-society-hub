/**
 * Joint-event identity: match member display names that refer to the same person
 * (reordered tokens, tee-sheet vs GameBook variants).
 */

/** Normalized names known to refer to the same real person (lowercase). */
export const JOINT_PERSON_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ["augustine gorejena", "gorejena farai", "farai gorejena"],
];

export function normalizeJointPersonName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function jointPersonNameTokenKey(name: string): string {
  return [...normalizeJointPersonName(name).split(" ")].filter(Boolean).sort().join(" ");
}

/**
 * True when two display names are the same person: exact match, token reorder
 * (e.g. "Farai Gorejena" / "Gorejena Farai"), or a known alias group.
 */
export function jointPersonNamesEquivalent(a: string, b: string): boolean {
  const na = normalizeJointPersonName(a);
  const nb = normalizeJointPersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (jointPersonNameTokenKey(na) === jointPersonNameTokenKey(nb)) return true;
  for (const group of JOINT_PERSON_ALIAS_GROUPS) {
    if (group.includes(na) && group.includes(nb)) return true;
  }
  return false;
}
