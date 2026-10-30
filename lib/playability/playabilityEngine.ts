/**
 * Converts normalised hourly forecast into golf playability insights.
 * WMO weather codes (Open-Meteo): https://open-meteo.com/en/docs
 */

import {
  evaluateRoundWindow as evaluateWeatherRoundWindow,
  type PlayabilityEngineOutput,
  type PlayabilityStatus,
  type RoundHourSample,
} from "@/lib/weather/playabilityEngine";
import { filterLocalDaytimeHours } from "@/lib/weather/playabilityPresentation";
import type {
  ComfortLevel,
  HourlyForecastPoint,
  PlayabilityInsight,
  PlayabilityLevel,
  RainRiskLevel,
  WindImpactLevel,
} from "./types";
import {
  filterHourlyToGolfDaylight,
  golfBoundsFromSunriseSunset,
  localMinutesFromForecastTime,
} from "./golfDaylightWindow";
import {
  buildPlayTimeline,
  comfortScan,
  rainIntensityFromHours,
  rainIntensityScan,
  windImpactScan,
} from "./weatherVisual";

function isHeavyPrecipCode(code: number): boolean {
  if (code >= 95) return true;
  if (code >= 80 && code <= 82) return true;
  if (code >= 65 && code <= 67) return true;
  return false;
}

function windLevel(maxW: number, avgW: number): WindImpactLevel {
  const w = Math.max(maxW, avgW * 1.15);
  if (w >= 45) return "extreme";
  if (w >= 32) return "high";
  if (w >= 22) return "moderate";
  return "low";
}

function rainLevel(maxProb: number, hasHeavyCode: boolean, thunder: boolean): RainRiskLevel {
  if (thunder || maxProb >= 75 || hasHeavyCode) return "high";
  if (maxProb >= 45) return "moderate";
  return "low";
}

function comfortLevel(avgT: number): ComfortLevel {
  if (avgT < 6) return "cold";
  if (avgT < 12) return "cool";
  if (avgT < 22) return "mild";
  if (avgT < 28) return "warm";
  return "hot";
}

function filterHoursForDate(hourly: HourlyForecastPoint[], ymd: string): HourlyForecastPoint[] {
  const day = hourly.filter(
    (h) =>
      (h.dateYmdLocal && h.dateYmdLocal === ymd) ||
      (typeof h.time === "string" && h.time.startsWith(ymd)),
  );
  return day.length > 0 ? day : hourly;
}

function levelFromEngineStatus(status: PlayabilityStatus, score: number | null): PlayabilityLevel {
  if (status === "NO_PLAY") return "severe";
  if (status === "CAUTION") return "poor";
  if (status === "MARGINAL") return "mixed";
  if (status === "UNKNOWN") return "mixed";
  const s = score ?? 72;
  if (s >= 82) return "excellent";
  if (s >= 68) return "good";
  if (s >= 52) return "mixed";
  if (s >= 38) return "poor";
  return "severe";
}

/** Map normalised forecast hours to the shape consumed by `lib/weather` evaluateRoundWindow. */
export function mapHourlyForecastPointsToRoundSamples(hours: HourlyForecastPoint[]): RoundHourSample[] {
  return hours.map((h) => ({
    timeIso: typeof h.time === "string" ? h.time : String(h.time ?? ""),
    windKmh: Number.isFinite(h.windKmh) ? h.windKmh : null,
    gustKmh: h.gustKmh != null && Number.isFinite(h.gustKmh) ? h.gustKmh : null,
    precipMmPerH: h.precipMmPerH != null && Number.isFinite(h.precipMmPerH) ? h.precipMmPerH : null,
    precipProbabilityPct: Number.isFinite(h.precipProbPercent) ? h.precipProbPercent : null,
    tempC: Number.isFinite(h.tempC) ? h.tempC : null,
    apparentTempC: h.apparentTempC != null && Number.isFinite(h.apparentTempC) ? h.apparentTempC : null,
    weatherCode: Number.isFinite(h.weatherCode) ? h.weatherCode : null,
  }));
}

function mapEngineToInsight(
  out: PlayabilityEngineOutput,
  targetDateYmd: string,
  slice: HourlyForecastPoint[],
  hourly: HourlyForecastPoint[],
  options?: ComputePlayabilityOptions,
): PlayabilityInsight {
  const playTimeline = buildPlayTimeline(
    hourly,
    targetDateYmd,
    options?.sunriseIso,
    options?.sunsetIso,
  );

  const poolForWindow = slice.length > 0 ? slice : filterHoursForDate(hourly, targetDateYmd);
  const { bestWindow, bestWindowFallback } = computeBestWindowDaylight(
    poolForWindow,
    targetDateYmd,
    options?.sunriseIso,
    options?.sunsetIso,
    options?.preferredTeeMinutesLocal ?? null,
  );

  const maxWind = slice.length > 0 ? Math.max(...slice.map((h) => h.windKmh)) : out.metrics.windKmh ?? 0;
  const avgWind = slice.length > 0 ? slice.reduce((s, h) => s + h.windKmh, 0) / slice.length : maxWind;
  const windImpact = windLevel(maxWind, avgWind);

  const thunder = out.debug.signals.thunder;
  const maxProb =
    out.metrics.rainProbabilityPct ??
    (slice.length > 0 ? Math.max(...slice.map((h) => h.precipProbPercent)) : 0);
  const heavyCode = slice.some((h) => isHeavyPrecipCode(h.weatherCode));
  const rainRisk = rainLevel(maxProb, heavyCode, thunder);
  const rainIntensity = rainIntensityFromHours(slice);

  const avgTemp =
    slice.length > 0 ? slice.reduce((s, h) => s + h.tempC, 0) / slice.length : out.metrics.tempC ?? 10;
  const comfort = comfortLevel(avgTemp);

  const rating =
    out.score != null ? Math.max(1, Math.min(10, Math.round((out.score / 10) * 10) / 10)) : 5;
  const level = levelFromEngineStatus(out.status, out.score);

  const windSummary = windImpactScan(windImpact).label;
  const rainSummary = rainIntensityScan(rainIntensity).label;
  const comfortSummary = comfortScan(comfort).label;

  const warnings = out.reasons.length > 0 ? [...out.reasons] : [];

  const ratingExplanation = `${rating.toFixed(1)}/10 · ${out.windRainSummary}`.trim();
  const recommendedAction =
    out.reasons.filter(Boolean).slice(0, 2).join(" ") || out.message || "Review conditions before you travel.";

  return {
    rating,
    level,
    label: out.statusLabel,
    summary: out.message,
    ratingExplanation,
    recommendedAction,
    warnings,
    windImpact,
    windSummary,
    rainRisk,
    rainIntensity,
    rainSummary,
    comfort,
    comfortSummary,
    bestWindow,
    bestWindowFallback,
    targetDate: targetDateYmd,
    playTimeline,
    engineSnapshot: out,
  };
}

export type ComputePlayabilityOptions = {
  sunriseIso?: string | null;
  sunsetIso?: string | null;
  /** Minutes from local midnight for member/event tee preference */
  preferredTeeMinutesLocal?: number | null;
};

type BestWindowOutcome = {
  bestWindow: string | null;
  bestWindowFallback: string | null;
};

function formatHourLabel(iso: string): string {
  const lm = localMinutesFromForecastTime(iso);
  if (lm == null) return iso.slice(11, 16);
  const h = Math.floor(lm / 60);
  const m = lm % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Best 3-hour window using only daylight golf hours (sunrise+30m … sunset−60m).
 */
function computeBestWindowDaylight(
  dayHoursForDate: HourlyForecastPoint[],
  targetDateYmd: string,
  sunriseIso: string | null | undefined,
  sunsetIso: string | null | undefined,
  preferredTeeMinutesLocal: number | null | undefined,
): BestWindowOutcome {
  const bounds = golfBoundsFromSunriseSunset(sunriseIso, sunsetIso);
  if (!bounds) {
    return {
      bestWindow: null,
      bestWindowFallback: "Conditions vary through the day",
    };
  }

  const candidates = filterHourlyToGolfDaylight(dayHoursForDate, targetDateYmd, bounds);
  if (candidates.length < 3) {
    return {
      bestWindow: null,
      bestWindowFallback: "No clear daytime playing window",
    };
  }

  let bestStart = 0;
  let bestScore = Infinity;
  for (let i = 0; i <= candidates.length - 3; i++) {
    const slice = candidates.slice(i, i + 3);
    let score =
      slice.reduce((s, h) => s + h.precipProbPercent + h.windKmh * 0.35, 0) / slice.length;

    if (preferredTeeMinutesLocal != null && Number.isFinite(preferredTeeMinutesLocal)) {
      const mins = slice
        .map((h) => localMinutesFromForecastTime(h.time))
        .filter((x): x is number => x != null);
      if (mins.length === 3) {
        const lo = Math.min(...mins);
        const hi = Math.max(...mins);
        const mid = (lo + hi) / 2;
        const dist = Math.abs(mid - preferredTeeMinutesLocal);
        score -= Math.max(0, 120 - dist) * 0.018;
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  const start = candidates[bestStart]?.time;
  const end = candidates[bestStart + 2]?.time;
  if (!start || !end) {
    return {
      bestWindow: null,
      bestWindowFallback: "No clear slot",
    };
  }

  return {
    bestWindow: `${formatHourLabel(start)}–${formatHourLabel(end)}`,
    bestWindowFallback: null,
  };
}

export function computePlayability(
  hourly: HourlyForecastPoint[],
  targetDateYmd: string,
  options?: ComputePlayabilityOptions,
): PlayabilityInsight | null {
  if (!hourly.length) return null;

  const dayHours = filterHoursForDate(hourly, targetDateYmd);
  const slice = dayHours.length > 0 ? dayHours : hourly;

  const roundSamples = filterLocalDaytimeHours(mapHourlyForecastPointsToRoundSamples(slice));
  const engineOut = evaluateWeatherRoundWindow({ countryCode: "GB", hourly: roundSamples });

  return mapEngineToInsight(engineOut, targetDateYmd, slice, hourly, options);
}
