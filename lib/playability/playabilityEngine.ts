/**
 * Converts normalised hourly forecast into golf playability insights.
 * WMO weather codes (Open-Meteo): https://open-meteo.com/en/docs
 */

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

function isThunderCode(code: number): boolean {
  return code >= 95 && code <= 99;
}

function isHeavyPrecipCode(code: number): boolean {
  if (code >= 95) return true;
  if (code >= 80 && code <= 82) return true;
  if (code >= 65 && code <= 67) return true;
  return false;
}

function levelFromRating(r: number): PlayabilityLevel {
  if (r >= 8.2) return "excellent";
  if (r >= 6.8) return "good";
  if (r >= 5.2) return "mixed";
  if (r >= 3.5) return "poor";
  return "severe";
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

function headlineLabel(level: PlayabilityLevel, rainRisk: RainRiskLevel, windImpact: WindImpactLevel): string {
  if (level === "excellent") return "Great day";
  if (level === "good") return "Good to go";
  if (level === "severe" || rainRisk === "high") return "High risk";
  if (level === "poor" || windImpact === "extreme") return "Brutal weather";
  if (level === "mixed") return "Pick a window";
  return "Caution";
}

function buildRatingExplanation(
  rating: number,
  level: PlayabilityLevel,
  maxProb: number,
  maxWind: number,
  thunder: boolean,
): string {
  const tags: string[] = [];
  if (thunder) tags.push("storms");
  else if (maxProb >= 65) tags.push("wet");
  else if (maxProb >= 38) tags.push("showers");
  if (maxWind >= 40) tags.push("windy");
  const tail = tags.length ? tags.join(" · ") : "mild signals";
  const band =
    level === "excellent" || level === "good"
      ? "favourable"
      : level === "mixed"
        ? "mixed"
        : "tough";
  return `${rating.toFixed(1)}/10 — ${band} (${tail}).`;
}

function recommendedActionText(
  level: PlayabilityLevel,
  rainRisk: RainRiskLevel,
  windImpact: WindImpactLevel,
  thunder: boolean,
  bestWindow: string | null,
  bestWindowFallback: string | null,
): string {
  if (thunder || rainRisk === "high") return "Call club — confirm tees.";
  if (windImpact === "extreme") {
    return bestWindow ? `Try ${bestWindow}.` : "Club up or delay.";
  }
  if (level === "excellent" || level === "good") return "Good to book.";
  if (rainRisk === "moderate") return "Pack waterproofs.";
  if (bestWindow) return `Best: ${bestWindow}.`;
  if (bestWindowFallback) return "Use timeline below.";
  return "Pick a clearer slot.";
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

  const avgTemp = slice.reduce((s, h) => s + h.tempC, 0) / slice.length;
  const avgProb = slice.reduce((s, h) => s + h.precipProbPercent, 0) / slice.length;
  const avgWind = slice.reduce((s, h) => s + h.windKmh, 0) / slice.length;
  const maxWind = Math.max(...slice.map((h) => h.windKmh));
  const maxProb = Math.max(...slice.map((h) => h.precipProbPercent));
  const thunder = slice.some((h) => isThunderCode(h.weatherCode));
  const heavyCode = slice.some((h) => isHeavyPrecipCode(h.weatherCode));

  let rating = 7.5;
  rating -= Math.min(3, avgProb * 0.035);
  if (avgWind >= 35) rating -= 1.8;
  else if (avgWind >= 28) rating -= 1.1;
  else if (avgWind >= 20) rating -= 0.55;
  if (thunder) rating -= 2.2;
  else if (heavyCode) rating -= 1.1;
  if (maxProb >= 70) rating -= 0.9;
  if (avgTemp < 3) rating -= 0.8;
  if (avgTemp > 30) rating -= 0.7;

  rating = Math.max(1, Math.min(10, Math.round(rating * 10) / 10));

  const windImpact = windLevel(maxWind, avgWind);
  const rainRisk = rainLevel(maxProb, heavyCode, thunder);
  const comfort = comfortLevel(avgTemp);
  const level = levelFromRating(rating);
  const rainIntensity = rainIntensityFromHours(slice);

  const warnings: string[] = [];
  if (windImpact === "extreme" || maxWind >= 45) {
    warnings.push("Gale wind");
  } else if (windImpact === "high") {
    warnings.push("Strong wind");
  }
  if (rainRisk === "high") {
    warnings.push("Heavy rain risk");
  } else if (rainRisk === "moderate") {
    warnings.push("Showers likely");
  }
  if (thunder) {
    warnings.push("Thunder risk");
  }
  if (comfort === "cold") {
    warnings.push("Cold round");
  }
  if (comfort === "hot") {
    warnings.push("Heat — hydrate");
  }

  const windSummary = windImpactScan(windImpact).label;
  const rainSummary = rainIntensityScan(rainIntensity).label;
  const comfortSummary = comfortScan(comfort).label;

  let summary = "Patchy — pick window.";
  if (level === "excellent" || level === "good") summary = "Solid playing day.";
  if (level === "poor" || level === "severe") summary = "Tough — confirm first.";

  const poolForWindow = dayHours.length > 0 ? dayHours : filterHoursForDate(hourly, targetDateYmd);
  const { bestWindow, bestWindowFallback } = computeBestWindowDaylight(
    poolForWindow,
    targetDateYmd,
    options?.sunriseIso,
    options?.sunsetIso,
    options?.preferredTeeMinutesLocal ?? null,
  );

  const label = headlineLabel(level, rainRisk, windImpact);
  const recommendedAction = recommendedActionText(
    level,
    rainRisk,
    windImpact,
    thunder,
    bestWindow,
    bestWindowFallback,
  );
  const ratingExplanation = buildRatingExplanation(rating, level, maxProb, maxWind, thunder);

  const playTimeline = buildPlayTimeline(
    hourly,
    targetDateYmd,
    options?.sunriseIso,
    options?.sunsetIso,
  );

  return {
    rating,
    level,
    label,
    summary,
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
  };
}
