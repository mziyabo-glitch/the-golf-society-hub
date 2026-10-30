/** Format a role string for display as a badge label */
export function formatRole(role?: string): string {
  if (!role) return "Member";
  const r = role.toLowerCase();
  const map: Record<string, string> = {
    captain: "Captain",
    secretary: "Secretary",
    treasurer: "Treasurer",
    handicapper: "Handicapper",
    member: "Member",
  };
  return map[r] || "Member";
}

/** Pretty-print a date string as "Sun 12 Apr" style */
export function formatEventDate(dateStr?: string): string {
  if (!dateStr) return "TBD";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return "TBD";
  }
}

/** Short date for compact display: "12 Apr" */
export function formatShortDate(dateStr?: string): string {
  if (!dateStr) return "TBD";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "TBD";
  }
}

/** Format event format label for display */
export function formatFormatLabel(format?: string): string {
  if (!format) return "";
  const map: Record<string, string> = {
    stableford: "Stableford",
    strokeplay_net: "Strokeplay (Net)",
    strokeplay_gross: "Strokeplay (Gross)",
    medal: "Medal",
  };
  return map[format.toLowerCase()] || format;
}

/** Format event classification for display */
export function formatClassification(classification?: string): string {
  if (!classification) return "General";
  const map: Record<string, string> = {
    general: "General",
    oom: "Order of Merit",
    major: "Major",
    friendly: "Friendly",
  };
  return map[classification.toLowerCase()] || classification;
}

/** Format OOM points nicely (home dashboard) */
export function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) return pts.toString();
  return pts.toFixed(1);
}
