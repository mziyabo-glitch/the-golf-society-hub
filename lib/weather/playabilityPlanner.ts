/**
 * Five-day forward playability planner: fixed 4-hour windows evaluated via evaluateRoundWindow.
 * Pure — no browser globals, no UI.
 */

import { golfBoundsFromSunriseSunset, localMinutesFromForecastTime } from "@/lib/playability/golfDaylightWindow";
import type { GolfDaylightBounds } from "@/lib/playability/golfDaylightWindow";
import {
  evaluateRoundWindow,
  type PlayabilityEngineOutput,
  type PlayabilityMetrics,
  type PlayabilityStatus,
  type RoundHourSample,
} from "./playabilityEngine";
import {
  formatFiveDayWeekOutlookLine,
  formatPlannerDayLabelEnGb,
  type DailySummaryKind,
} from "./playabilityPlannerPresentation";

export type { DailySummaryKind };

export type DaySunlightMeta = {
  dateYmd: string;
  sunriseIso: string | null;
  sunsetIso: string | null;
};

export type FiveDayPlannerInput = {
  countryCode?: string | null;
  /** First calendar day (YYYY-MM-DD), inclusive */
  startDateYmd: string;
  /** Multi-day hourly rows (venue-local time strings) */
  hourly: RoundHourSample[];
  /** Optional sunrise/sunset per day — when set, fixed windows that never overlap playable daylight are omitted */
  daySunlight?: DaySunlightMeta[] | null;
};

export type PlannerWindowEvaluation = {
  label: string;
  startHour: number;
  endHour: number;
  status: PlayabilityStatus;
  score: number | null;
  message: string;
  reasons: string[];
  metrics: PlayabilityMetrics;
};

export type FiveDayDailyPlan = {
  date: string;
  dayLabel: string;
  overallStatus: PlayabilityStatus;
  overallScore: number | null;
  dailySummaryKind: DailySummaryKind;
  summaryMessage: string;
  bestWindow: string | null;
  /** True when the best window stands out clearly from the rest (wording uses firmer guidance). */
  bestWindowIsClear: boolean;
  windows: PlannerWindowEvaluation[];
};

export type FiveDayPlayabilityPlan = {
  startDateYmd: string;
  days: FiveDayDailyPlan[];
};

/** Default 4-hour blocks (local wall clock at venue). */
export const DEFAULT_FOUR_HOUR_WINDOWS: readonly { label: string; startHour: number; endHour: number }[] = [
  { label: "06:00–10:00", startHour: 6, endHour: 10 },
  { label: "10:00–14:00", startHour: 10, endHour: 14 },
  { label: "14:00–18:00", startHour: 14, endHour: 18 },
] as const;

function dateYmdFromSample(s: RoundHourSample): string | null {
  const t = s.timeIso?.trim();
  if (!t || t.length < 10) return null;
  const d = t.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function hourFromSample(s: RoundHourSample): number | null {
  const m = /T(\d{2}):/.exec(s.timeIso ?? "");
  if (!m) return null;
  const h = parseInt(m[1], 10);
  return Number.isFinite(h) ? h : null;
}

function addDaysYmd(ymd: string, add: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + add);
  if (!Number.isFinite(dt.getTime())) return null;
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const da = String(dt.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function boundsForDay(meta: DaySunlightMeta[] | null | undefined, dateYmd: string): GolfDaylightBounds | null {
  if (!meta?.length) return null;
  const row = meta.find((d) => d.dateYmd === dateYmd);
  if (!row) return null;
  return golfBoundsFromSunriseSunset(row.sunriseIso, row.sunsetIso);
}

/**
 * True if any whole-hour start in [startHour, endHour) can fall inside playable daylight.
 * Omits a window only when it cannot overlap golf daylight — not when the forecast simply lacks rows yet.
 */
function windowOverlapsDaylightHourStarts(startHour: number, endHour: number, bounds: GolfDaylightBounds): boolean {
  for (let h = startHour; h < endHour; h++) {
    const hm = h * 60;
    if (hm >= bounds.earliestStartMin && hm <= bounds.latestStartMin) return true;
  }
  return false;
}

/**
 * Hours in [startHour, endHour) on dateYmd, optionally restricted to golf daylight hour-starts.
 */
function collectWindowHours(
  hourly: RoundHourSample[],
  dateYmd: string,
  startHour: number,
  endHour: number,
  bounds: GolfDaylightBounds | null,
): RoundHourSample[] {
  return hourly.filter((s) => {
    const d = dateYmdFromSample(s);
    if (d !== dateYmd) return false;
    const hh = hourFromSample(s);
    if (hh == null) return false;
    if (hh < startHour || hh >= endHour) return false;
    if (bounds) {
      const mins = localMinutesFromForecastTime(s.timeIso);
      if (mins == null) return false;
      if (mins < bounds.earliestStartMin || mins > bounds.latestStartMin) return false;
    }
    return true;
  });
}

function aggregateOverallStatus(windows: PlannerWindowEvaluation[]): PlayabilityStatus {
  if (windows.length === 0) return "UNKNOWN";
  if (windows.some((w) => w.status === "NO_PLAY")) return "NO_PLAY";
  if (windows.some((w) => w.status === "CAUTION")) return "CAUTION";
  if (windows.some((w) => w.status === "MARGINAL")) return "MARGINAL";
  if (windows.some((w) => w.status === "PLAY")) return "PLAY";
  if (windows.every((w) => w.status === "UNKNOWN")) return "UNKNOWN";
  return "UNKNOWN";
}

function blendOverallScore(windows: PlannerWindowEvaluation[]): number | null {
  const scores = windows.map((w) => w.score).filter((s): s is number => s != null && Number.isFinite(s));
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1]!;
  const mid = sorted[Math.floor((sorted.length - 1) / 2)]!;
  const min = sorted[0]!;
  const blended = max * 0.48 + mid * 0.35 + min * 0.17;
  return Math.max(0, Math.min(100, Math.round(blended)));
}

function pickBestWindowLabel(windows: PlannerWindowEvaluation[]): string | null {
  if (windows.length === 0) return null;
  const statusRank = (s: PlayabilityStatus): number =>
    s === "NO_PLAY" ? 4 : s === "CAUTION" ? 3 : s === "MARGINAL" ? 2 : s === "PLAY" ? 0 : 1;
  let best = windows[0]!;
  let bestScore = best.score ?? -1;
  for (const w of windows) {
    const sc = w.score ?? -1;
    if (sc > bestScore) {
      best = w;
      bestScore = sc;
    } else if (sc === bestScore && sc >= 0) {
      if (w.startHour < best.startHour) best = w;
    } else if (sc < 0 && bestScore < 0) {
      if (statusRank(w.status) < statusRank(best.status)) best = w;
      else if (statusRank(w.status) === statusRank(best.status) && w.startHour < best.startHour) best = w;
    }
  }
  if (bestScore < 0 && windows.every((w) => w.status === "UNKNOWN")) return null;
  return best.label;
}

/** Top score clearly ahead of the next (for copy + narrow-day detection). */
function hasUnambiguousBestWindow(windows: PlannerWindowEvaluation[]): boolean {
  if (windows.length <= 1) return true;
  const scores = windows.map((w) => w.score).filter((s): s is number => s != null && Number.isFinite(s));
  if (scores.length === 0) return false;
  const sorted = [...scores].sort((a, b) => b - a);
  if (sorted.length < 2) return true;
  return sorted[0]! - sorted[1]! >= 6;
}

function classifyDailySummary(windows: PlannerWindowEvaluation[]): DailySummaryKind {
  if (windows.length === 0) return "POOR_DAY";
  if (windows.some((w) => w.status === "NO_PLAY")) return "POOR_DAY";

  const scores = windows.map((w) => w.score).filter((s): s is number => s != null);
  const playCount = windows.filter((w) => w.status === "PLAY").length;
  const cautionCount = windows.filter((w) => w.status === "CAUTION").length;
  const marginalCount = windows.filter((w) => w.status === "MARGINAL").length;
  const unknownCount = windows.filter((w) => w.status === "UNKNOWN").length;
  const allMarginal =
    marginalCount === windows.length && playCount === 0 && cautionCount === 0 && unknownCount === 0;

  const sortedScores = [...scores].sort((a, b) => b - a);
  const best = sortedScores[0] ?? null;
  const second = sortedScores[1] ?? null;

  if (allMarginal && best != null && best >= 52) return "PLAYABLE_WITH_CAUTION";

  if (best != null && second != null && best - second >= 14 && playCount + marginalCount > 0) {
    if (playCount >= 1 || best >= 68) return "NARROW_WINDOW";
  }

  /** At least one comfortable block plus one that needs extra care (e.g. gust spike) — still a golf day, not "all clear". */
  if (cautionCount >= 1 && playCount >= 1) return "PLAYABLE_WITH_CAUTION";

  if (windows.length === 1 && playCount === 1 && cautionCount === 0 && marginalCount === 0 && (best ?? 0) >= 70) {
    return "GOOD_DAY";
  }
  if (playCount >= 2 && cautionCount === 0 && marginalCount === 0) return "GOOD_DAY";
  if (playCount >= 1 && cautionCount === 0 && marginalCount <= 1) return "GOOD_DAY";
  if (playCount >= 1 && best != null && best >= 74 && cautionCount <= 1) return "GOOD_DAY";

  if (playCount >= 1 || (marginalCount >= 1 && best != null && best >= 58)) {
    if (cautionCount >= 2) return "PLAYABLE_WITH_CAUTION";
    if (cautionCount === 1 && unknownCount <= 1) return "PLAYABLE_WITH_CAUTION";
    if (cautionCount <= 1 && marginalCount <= 2) return "PLAYABLE_WITH_CAUTION";
  }

  if (marginalCount >= 1 && cautionCount === 0 && playCount === 0 && unknownCount <= 1) {
    return "PLAYABLE_WITH_CAUTION";
  }

  if (unknownCount === windows.length) return "POOR_DAY";
  return "POOR_DAY";
}

function buildSummaryMessage(
  kind: DailySummaryKind,
  bestWindow: string | null,
  windows: PlannerWindowEvaluation[],
  bestIsClear: boolean,
): string {
  const usable = windows.filter((w) => w.status !== "UNKNOWN");
  if (usable.length === 0) {
    return "We’re short on reliable detail for this day — worth another look before you travel.";
  }
  switch (kind) {
    case "GOOD_DAY":
      if (bestWindow && bestIsClear) {
        return `Plenty of room to work with — ${bestWindow} is the pick of the bunch.`;
      }
      if (bestWindow) {
        return `A few inviting stretches; ${bestWindow} edges it for comfort.`;
      }
      return "Several stretches look comfortable for golf.";
    case "PLAYABLE_WITH_CAUTION":
      if (bestWindow && bestIsClear) {
        return `You can still get a decent round in — aim for ${bestWindow} if you can.`;
      }
      if (bestWindow) {
        return `Worth playing, but pick your timing — ${bestWindow} is the kinder slot.`;
      }
      return "Playable, but you’ll want to keep an eye on the sky and the wind.";
    case "NARROW_WINDOW":
      if (bestWindow && bestIsClear) {
        return `Quality is bunched into ${bestWindow} — worth locking that in.`;
      }
      if (bestWindow) {
        return `The softer spell sits around ${bestWindow}; either side looks trickier.`;
      }
      return "One part of the day carries most of the promise — plan around it.";
    case "POOR_DAY":
    default:
      if (windows.some((w) => w.status === "NO_PLAY")) {
        return "Serious weather in the mix — a rain check or a call to the pro shop is sensible.";
      }
      return "No stretch really sells itself — another day or a very loose tee time might suit better.";
  }
}

function toWindowEvaluation(out: PlayabilityEngineOutput, def: { label: string; startHour: number; endHour: number }): PlannerWindowEvaluation {
  return {
    label: def.label,
    startHour: def.startHour,
    endHour: def.endHour,
    status: out.status,
    score: out.score,
    message: out.message,
    reasons: [...out.reasons],
    metrics: { ...out.metrics },
  };
}

/** Strongest scored four-hour block across the plan (ties → earlier day, then earlier hour). */
function pickBestWindowAcrossPlan(plan: FiveDayPlayabilityPlan): {
  dayLabel: string;
  w: PlannerWindowEvaluation;
  score: number;
} | null {
  let best: { dayIndex: number; dayLabel: string; w: PlannerWindowEvaluation } | null = null;
  let bestScore = -1;
  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    const day = plan.days[dayIndex]!;
    for (const w of day.windows) {
      const sc = w.score ?? -1;
      const better =
        best == null ||
        sc > bestScore ||
        (sc === bestScore &&
          sc >= 0 &&
          (dayIndex < best.dayIndex || (dayIndex === best.dayIndex && w.startHour < best.w.startHour)));
      if (better) {
        bestScore = sc;
        best = { dayIndex, dayLabel: day.dayLabel, w };
      }
    }
  }
  if (!best || bestScore < 0) return null;
  return { dayLabel: best.dayLabel, w: best.w, score: bestScore };
}

/**
 * Home dashboard: one line when a standout four-hour slot exists (score threshold matches prior teaser).
 */
export function formatDashboardBestNextSlot(plan: FiveDayPlayabilityPlan | null): string | null {
  if (!plan?.days.length) return null;
  const picked = pickBestWindowAcrossPlan(plan);
  if (!picked || picked.score < 72) return null;
  const dayWord = picked.dayLabel.split(",")[0]?.trim() ?? picked.dayLabel;
  return `Best next slot · ${dayWord} ${picked.w.label}`;
}

export type DashboardFiveDayPlanning = {
  bestNextSlot: string | null;
  weekOutlook: string;
};

/** Dashboard copy: separate slot headline from week tone (no engine changes). */
export function formatDashboardFiveDayPlanning(plan: FiveDayPlayabilityPlan | null): DashboardFiveDayPlanning | null {
  if (!plan?.days.length) return null;
  const bestNextSlot = formatDashboardBestNextSlot(plan);
  const weekOutlook = formatFiveDayWeekOutlookLine(plan.days);
  return { bestNextSlot, weekOutlook };
}

/**
 * Build a 5-day plan: each day uses up to three fixed 4-hour windows, each passed through evaluateRoundWindow.
 */
export function evaluateFiveDayPlayabilityPlan(input: FiveDayPlannerInput): FiveDayPlayabilityPlan {
  const start = (input.startDateYmd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return { startDateYmd: start, days: [] };
  }

  const hourly = input.hourly ?? [];
  const country = input.countryCode ?? null;
  const days: FiveDayDailyPlan[] = [];

  for (let i = 0; i < 5; i++) {
    const date = addDaysYmd(start, i);
    if (!date) continue;

    const bounds = boundsForDay(input.daySunlight ?? null, date);
    const windows: PlannerWindowEvaluation[] = [];

    for (const def of DEFAULT_FOUR_HOUR_WINDOWS) {
      if (bounds && !windowOverlapsDaylightHourStarts(def.startHour, def.endHour, bounds)) {
        continue;
      }
      const slice = collectWindowHours(hourly, date, def.startHour, def.endHour, bounds);
      const out = evaluateRoundWindow({ countryCode: country, hourly: slice });
      windows.push(toWindowEvaluation(out, def));
    }

    const overallStatus = aggregateOverallStatus(windows);
    const overallScore = blendOverallScore(windows);
    const dailySummaryKind = classifyDailySummary(windows);
    const bestWindow = pickBestWindowLabel(windows);
    const bestWindowIsClear = hasUnambiguousBestWindow(windows);
    const summaryMessage = buildSummaryMessage(dailySummaryKind, bestWindow, windows, bestWindowIsClear);

    days.push({
      date,
      dayLabel: formatPlannerDayLabelEnGb(date),
      overallStatus,
      overallScore,
      dailySummaryKind,
      summaryMessage,
      bestWindow,
      bestWindowIsClear,
      windows,
    });
  }

  return { startDateYmd: start, days };
}

/** @internal Vitest — day classifier */
export function plannerClassifyDayKindForTest(windows: PlannerWindowEvaluation[]): DailySummaryKind {
  return classifyDailySummary(windows);
}

/** @internal Vitest — summary line */
export function plannerBuildSummaryForTest(
  kind: DailySummaryKind,
  bestWindow: string | null,
  windows: PlannerWindowEvaluation[],
  bestIsClear: boolean,
): string {
  return buildSummaryMessage(kind, bestWindow, windows, bestIsClear);
}
