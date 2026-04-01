/**
 * Icon-led weather copy: emojis + 1–2 word labels for sub-second scanning.
 * WMO codes (Open-Meteo): https://open-meteo.com/en/docs
 */

import { filterHourlyToGolfDaylight, golfBoundsFromSunriseSunset, localMinutesFromForecastTime } from "./golfDaylightWindow";
import type {
  ComfortLevel,
  HourlyForecastPoint,
  PlayTimelineSlot,
  RainIntensityLevel,
  WindImpactLevel,
} from "./types";

function formatShortAm(mins: number): string {
  let h = Math.floor(mins / 60);
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}${ampm}`;
}

/** Single-hour emoji: rain intensity + sky state, not % alone */
export function emojiForHourlyPoint(h: HourlyForecastPoint): string {
  const c = h.weatherCode;
  if (c >= 95) return "⛈️";
  if (c >= 82 || c === 65 || c === 67) return "🌧️";
  if (c >= 61 || c === 80 || c === 81) return "🌧️";
  if (c >= 51 && c <= 58) return "🌦️";
  const p = h.precipProbPercent;
  if (p >= 70) return "🌧️";
  if (p >= 42) return "🌦️";
  if (p >= 20) return "🌤️";
  if (c === 0 || c === 1) return p < 12 ? "☀️" : "🌤️";
  if (c >= 2 && c <= 3) return "⛅";
  if (c === 45 || c === 48) return "🌫️";
  if (c >= 71 && c <= 77) return "🌨️";
  return "⛅";
}

function hourWetScore(h: HourlyForecastPoint): number {
  const c = h.weatherCode;
  if (c >= 95) return 5;
  if (c >= 82 || c === 65 || c === 67) return 4;
  if (c >= 63 || c === 81) return 4;
  if (c >= 61 || c === 80) return 3;
  if (c >= 51 && c <= 58) return 2;
  const p = h.precipProbPercent;
  if (p >= 78) return 4;
  if (p >= 52) return 3;
  if (p >= 28) return 2;
  if (p >= 12) return 1;
  return 0;
}

export function rainIntensityFromHours(hours: HourlyForecastPoint[]): RainIntensityLevel {
  if (hours.length === 0) return "none";
  const max = Math.max(...hours.map(hourWetScore));
  if (max >= 5) return "storm";
  if (max >= 4) return "heavy";
  if (max >= 3) return "moderate";
  if (max >= 2) return "light";
  if (max >= 1) return "light";
  return "none";
}

export function windImpactScan(impact: WindImpactLevel): { emoji: string; label: string } {
  switch (impact) {
    case "low":
      return { emoji: "🍃", label: "Calm" };
    case "moderate":
      return { emoji: "💨", label: "Breezy" };
    case "high":
      return { emoji: "🌬️", label: "Strong" };
    case "extreme":
      return { emoji: "⚠️", label: "Gale" };
    default:
      return { emoji: "🍃", label: "Calm" };
  }
}

export function rainIntensityScan(level: RainIntensityLevel): { emoji: string; label: string } {
  switch (level) {
    case "none":
      return { emoji: "☀️", label: "Dry" };
    case "light":
      return { emoji: "🌦️", label: "Light" };
    case "moderate":
      return { emoji: "🌧️", label: "Wet" };
    case "heavy":
      return { emoji: "🌧️", label: "Heavy" };
    case "storm":
      return { emoji: "⛈️", label: "Storm" };
    default:
      return { emoji: "⛅", label: "Dry" };
  }
}

export function comfortScan(comfort: ComfortLevel): { emoji: string; label: string } {
  switch (comfort) {
    case "cold":
      return { emoji: "🥶", label: "Cold" };
    case "cool":
      return { emoji: "🧥", label: "Cool" };
    case "mild":
      return { emoji: "✓", label: "Mild" };
    case "warm":
      return { emoji: "🌡️", label: "Warm" };
    case "hot":
      return { emoji: "🥵", label: "Hot" };
    default:
      return { emoji: "✓", label: "Mild" };
  }
}

/** 8am / 10am / 12pm / 2pm-style strip inside golf daylight (or 7–17h fallback). */
export function buildPlayTimeline(
  hourly: HourlyForecastPoint[],
  targetDateYmd: string,
  sunriseIso: string | null | undefined,
  sunsetIso: string | null | undefined,
): PlayTimelineSlot[] {
  const dayHours = hourly.filter(
    (h) =>
      h.dateYmdLocal === targetDateYmd ||
      (typeof h.time === "string" && h.time.startsWith(targetDateYmd)),
  );
  if (dayHours.length === 0) return [];

  const bounds = golfBoundsFromSunriseSunset(sunriseIso, sunsetIso);
  let candidates: HourlyForecastPoint[];
  if (bounds) {
    candidates = filterHourlyToGolfDaylight(dayHours, targetDateYmd, bounds);
  } else {
    candidates = dayHours.filter((h) => {
      const lm = localMinutesFromForecastTime(h.time);
      if (lm == null) return false;
      return lm >= 7 * 60 && lm <= 16 * 60 + 45;
    });
  }
  if (candidates.length === 0) candidates = dayHours;

  const targets = [8 * 60, 10 * 60, 12 * 60, 14 * 60];
  const used = new Set<string>();
  const slots: PlayTimelineSlot[] = [];

  for (const targetMin of targets) {
    let best: HourlyForecastPoint | null = null;
    let bestD = Infinity;
    for (const h of candidates) {
      if (used.has(h.time)) continue;
      const lm = localMinutesFromForecastTime(h.time);
      if (lm == null) continue;
      const d = Math.abs(lm - targetMin);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (best) {
      used.add(best.time);
      const lm = localMinutesFromForecastTime(best.time);
      slots.push({
        timeLabel: lm != null ? formatShortAm(lm) : "—",
        emoji: emojiForHourlyPoint(best),
      });
    }
  }

  if (slots.length >= 2) return slots;
  return buildSparseTimelineFromHours(candidates.length >= 2 ? candidates : dayHours);
}

export function buildSparseTimelineFromHours(hours: HourlyForecastPoint[]): PlayTimelineSlot[] {
  if (hours.length === 0) return [];
  const sorted = [...hours].sort(
    (a, b) => (localMinutesFromForecastTime(a.time) ?? 0) - (localMinutesFromForecastTime(b.time) ?? 0),
  );
  const n = sorted.length;
  const picks = n <= 4 ? sorted : [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1].map((i) => sorted[i]);
  return picks.map((h) => {
    const lm = localMinutesFromForecastTime(h.time);
    return {
      timeLabel: lm != null ? formatShortAm(lm) : "—",
      emoji: emojiForHourlyPoint(h),
    };
  });
}

export function dailyOutlookEmoji(d: { weatherCode?: number; precipProbMaxPercent: number; windMaxKmh: number }): string {
  const code = d.weatherCode ?? 0;
  if (code >= 95) return "⛈️";
  if (code >= 71 && code <= 86) return "🌨️";
  if (code >= 61 || d.precipProbMaxPercent >= 58) return "🌧️";
  if (code >= 51 || d.precipProbMaxPercent >= 32) return "🌦️";
  if (d.windMaxKmh >= 38) return "💨";
  if (code <= 1 && d.precipProbMaxPercent < 18) return "☀️";
  return "⛅";
}

/** Two tags: rain strength + wind impact (no raw % in label). */
export function dailyOutlookTags(d: {
  weatherCode?: number;
  precipProbMaxPercent: number;
  windMaxKmh: number;
}): { rain: string; wind: string } {
  const code = d.weatherCode ?? 0;
  let rain = "Dry";
  if (code >= 95) rain = "Storm";
  else if (code >= 65 || d.precipProbMaxPercent >= 72) rain = "Heavy";
  else if (code >= 61 || d.precipProbMaxPercent >= 45) rain = "Wet";
  else if (code >= 51 || d.precipProbMaxPercent >= 22) rain = "Showers";

  let wind = "Calm";
  if (d.windMaxKmh >= 45) wind = "Gale";
  else if (d.windMaxKmh >= 32) wind = "Strong";
  else if (d.windMaxKmh >= 22) wind = "Breezy";

  return { rain, wind };
}
