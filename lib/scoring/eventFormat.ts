/**
 * Canonical scoring formats. All scoring code should consume only these (after {@link normalizeEventFormat}).
 */

export type EventFormat = "stableford" | "strokeplay_net" | "strokeplay_gross";

export type EventScoringMode = "points" | "strokes";

/**
 * Single source of truth: map legacy `events.format` strings → canonical values.
 * Add new legacy aliases only here.
 */
export function normalizeEventFormat(rawFormat: string | null | undefined): EventFormat {
  const f = String(rawFormat ?? "").trim().toLowerCase().replace(/\s+/g, "_");

  if (f === "stableford") return "stableford";
  if (f === "strokeplay_net" || f === "strokeplay_net_score") return "strokeplay_net";
  if (f === "strokeplay_gross" || f === "strokeplay_gross_score") return "strokeplay_gross";

  // Legacy: medal / generic strokeplay → net by default (UK societies)
  if (f === "medal" || f === "strokeplay" || f === "stroke_play_net") return "strokeplay_net";
  if (f.includes("gross")) return "strokeplay_gross";
  if (f.includes("net")) return "strokeplay_net";
  if (f.includes("stroke")) return "strokeplay_net";

  throw new Error(`normalizeEventFormat: unsupported format "${rawFormat ?? ""}"`);
}

/**
 * Maps canonical format to how primary scores are compared. Pass raw DB strings through {@link normalizeEventFormat} first.
 */
export function getEventScoringMode(format: string): EventScoringMode {
  const canonical = normalizeEventFormat(format);
  if (canonical === "stableford") return "points";
  return "strokes";
}
