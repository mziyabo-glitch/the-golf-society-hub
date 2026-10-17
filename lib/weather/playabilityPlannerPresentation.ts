/**
 * Pure string helpers for the 5-day playability planner (no React).
 */

export type DailySummaryKind =
  | "GOOD_DAY"
  | "PLAYABLE_WITH_CAUTION"
  | "NARROW_WINDOW"
  | "POOR_DAY";

export function formatPlannerDayLabelEnGb(dateYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd.trim());
  if (!m) return dateYmd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(d.getTime())) return dateYmd;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function dailySummaryKindHeadline(kind: DailySummaryKind): string {
  switch (kind) {
    case "GOOD_DAY":
      return "Strong day";
    case "PLAYABLE_WITH_CAUTION":
      return "Playable, watchful";
    case "NARROW_WINDOW":
      return "Pick your window";
    case "POOR_DAY":
    default:
      return "Hard going";
  }
}

export function windowChipShortLabel(startHour: number, endHour: number): string {
  const a = String(startHour).padStart(2, "0");
  const b = String(endHour).padStart(2, "0");
  return `${a}–${b}`;
}

/**
 * One-line week tone from planner day kinds (presentation only — no forecast math).
 */
export function formatFiveDayWeekOutlookLine(
  days: ReadonlyArray<{ dailySummaryKind: DailySummaryKind }>,
): string {
  const n = days.length;
  if (n === 0) return "";

  let poor = 0;
  let narrow = 0;
  let good = 0;
  let watch = 0;
  for (const d of days) {
    switch (d.dailySummaryKind) {
      case "POOR_DAY":
        poor++;
        break;
      case "NARROW_WINDOW":
        narrow++;
        break;
      case "GOOD_DAY":
        good++;
        break;
      case "PLAYABLE_WITH_CAUTION":
        watch++;
        break;
      default:
        break;
    }
  }

  if (poor >= 4) return "Poor golfing week ahead.";
  if (poor >= 3 && good === 0 && narrow <= 1) return "Poor golfing week ahead.";

  if (narrow >= 2) return "Narrow weather windows — timing matters.";
  if (narrow === 1 && good + watch <= 1) return "Narrow weather windows — timing matters.";

  if (good >= 3 && poor <= 1) return "Strong golfing stretch this week.";

  if (good >= 2 || narrow === 1 || watch >= 2) return "Mixed week — pick your moments.";

  return "Mixed week — pick your moments.";
}
