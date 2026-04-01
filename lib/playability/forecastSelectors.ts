/**
 * UI helpers — golf-day hours, tee-time window strip, etc.
 */

import type { DailyForecastPoint, HourlyForecastPoint } from "./types";

/** Hours on target local day between startHour and endHour inclusive (24h clock). */
export function selectHoursOnLocalDay(
  hourly: HourlyForecastPoint[],
  targetDateYmd: string,
  startHour = 6,
  endHour = 21,
): HourlyForecastPoint[] {
  return hourly.filter((h) => {
    if (h.dateYmdLocal !== targetDateYmd) return false;
    const hour = parseHourFromPoint(h);
    if (hour == null) return true;
    return hour >= startHour && hour <= endHour;
  });
}

function parseHourFromPoint(h: HourlyForecastPoint): number | null {
  const t = h.time;
  if (typeof t !== "string") return null;
  // "2025-04-01T14:00" or "2025-04-01 14:00:00"
  const m = t.match(/T(\d{2}):/) || t.match(/\s(\d{2}):/);
  if (m) return Number(m[1]);
  return null;
}

/** Prefer denser strip for scroll; if sparse, return whatever exists for that day. */
export function selectHourlyStripForUi(
  hourly: HourlyForecastPoint[],
  targetDateYmd: string,
): HourlyForecastPoint[] {
  const windowed = selectHoursOnLocalDay(hourly, targetDateYmd, 6, 21);
  if (windowed.length > 0) return windowed;
  return hourly.filter((h) => h.dateYmdLocal === targetDateYmd);
}

/** Daily rows from target date forward (e.g. 5-day outlook). */
export function selectDailyOutlookFrom(
  daily: DailyForecastPoint[],
  targetDateYmd: string,
  maxDays = 5,
): DailyForecastPoint[] {
  const i = daily.findIndex((d) => d.dateYmd >= targetDateYmd);
  const start = i >= 0 ? i : 0;
  return daily.slice(start, start + maxDays);
}
