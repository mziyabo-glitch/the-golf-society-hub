/**
 * Golf daylight constraints for playability "best window" — venue-local times from forecast strings.
 * Assumes hourly rows and sunrise/sunset from the same provider response share the same local calendar semantics.
 */

import type { HourlyForecastPoint } from "./types";

/** Minutes after sunrise before first playable hour */
export const GOLF_SUNRISE_BUFFER_MIN = 30;
/** Minutes before sunset for last playable hour start */
export const GOLF_SUNSET_BUFFER_MIN = 60;
/** Minimum span (minutes) between earliest and latest allowed hour-start for a 3-hour window */
export const MIN_DAYLIGHT_SPAN_FOR_3H_WINDOW_MIN = 120;

/**
 * Extract HH:mm as minutes from midnight from provider time strings
 * (e.g. "2026-04-01T14:00", "2026-04-01 14:00:00").
 */
export function localMinutesFromForecastTime(isoLike: string): number | null {
  const t = isoLike?.trim();
  if (!t) return null;
  const m = t.match(/T(\d{1,2}):(\d{2})/) || t.match(/\s(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

/** Parse "9:10" / "09:10" → minutes from midnight */
export function parsePreferredTeeMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm || typeof hhmm !== "string") return null;
  const s = hhmm.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export type GolfDaylightBounds = {
  /** Earliest allowed hour-start (minutes from midnight) */
  earliestStartMin: number;
  /** Latest allowed hour-start (minutes from midnight) */
  latestStartMin: number;
};

/**
 * Build playable bounds from Open-Meteo-style sunrise/sunset ISO strings for that calendar day.
 */
export function golfBoundsFromSunriseSunset(
  sunriseIso: string | null | undefined,
  sunsetIso: string | null | undefined,
): GolfDaylightBounds | null {
  const rise = sunriseIso?.trim();
  const set = sunsetIso?.trim();
  if (!rise || !set) return null;
  const r = localMinutesFromForecastTime(rise);
  const s = localMinutesFromForecastTime(set);
  if (r == null || s == null) return null;
  if (s <= r) return null;

  const earliestStartMin = r + GOLF_SUNRISE_BUFFER_MIN;
  const latestStartMin = s - GOLF_SUNSET_BUFFER_MIN;
  if (latestStartMin < earliestStartMin) return null;
  if (latestStartMin - earliestStartMin < MIN_DAYLIGHT_SPAN_FOR_3H_WINDOW_MIN) return null;

  return { earliestStartMin, latestStartMin };
}

/**
 * Hourly points on target YMD whose hour-start falls inside [earliestStartMin, latestStartMin].
 */
export function filterHourlyToGolfDaylight(
  dayHours: HourlyForecastPoint[],
  targetDateYmd: string,
  bounds: GolfDaylightBounds,
): HourlyForecastPoint[] {
  return dayHours.filter((h) => {
    if (h.dateYmdLocal && h.dateYmdLocal !== targetDateYmd) return false;
    if (!h.dateYmdLocal && typeof h.time === "string" && !h.time.startsWith(targetDateYmd)) return false;
    const hm = localMinutesFromForecastTime(h.time);
    if (hm == null) return false;
    return hm >= bounds.earliestStartMin && hm <= bounds.latestStartMin;
  });
}
