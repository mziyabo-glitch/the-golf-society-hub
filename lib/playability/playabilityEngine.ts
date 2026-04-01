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
  if (level === "excellent") return "Great day for golf";
  if (level === "good") return "Good to go";
  if (level === "severe" || rainRisk === "high") return "High risk day";
  if (level === "poor" || windImpact === "extreme") return "Brutal elements";
  if (level === "mixed") return "Pick your window";
  return "Proceed with caution";
}

function buildRatingExplanation(
  rating: number,
  level: PlayabilityLevel,
  avgProb: number,
  maxProb: number,
  avgWind: number,
  maxWind: number,
  thunder: boolean,
  heavyCode: boolean,
  avgTemp: number,
): string {
  const intro = `This ${rating.toFixed(
    1,
  )}/10 score blends average and peak rain chance, wind through the day, any storm or heavy-rain signals in the forecast hours, and temperature — then rounds to one number so you can compare days at a glance.`;

  const parts: string[] = [];
  if (thunder) {
    parts.push("Thunder risk in the window is treated as a major penalty.");
  } else if (heavyCode) {
    parts.push("Heavy-rain or downpour-style weather codes in the hourly data reduce the score.");
  }

  if (maxProb >= 70) {
    parts.push(`Peak rain chance reaches about ${Math.round(maxProb)}%.`);
  } else if (avgProb >= 48) {
    parts.push(`Rain chance averages near ${Math.round(avgProb)}% across the hours we looked at.`);
  } else if (avgProb >= 28) {
    parts.push(`A modest rain signal (around ${Math.round(avgProb)}% on average) trims the rating slightly.`);
  }

  if (maxWind >= 44) {
    parts.push(`Peak wind near ${Math.round(maxWind)} km/h is a significant drag.`);
  } else if (avgWind >= 28) {
    parts.push(`Average wind near ${Math.round(avgWind)} km/h costs comfort and scoring.`);
  } else if (avgWind >= 18) {
    parts.push(`A steady breeze near ${Math.round(avgWind)} km/h nudges the score down a little.`);
  }

  if (avgTemp <= 4) {
    parts.push("Cold temperatures deduct a bit for standing on exposed tees.");
  }
  if (avgTemp >= 30) {
    parts.push("Very warm conditions deduct a bit for comfort over 18 holes.");
  }

  const band =
    level === "excellent"
      ? "excellent"
      : level === "good"
        ? "good"
        : level === "mixed"
          ? "mixed"
          : level === "poor"
            ? "difficult"
            : "very difficult";

  const middle =
    parts.length > 0
      ? parts.slice(0, 4).join(" ")
      : "Right now, rain, wind, and temperature penalties are light compared with a rough-weather day, which keeps the score up.";

  const outro = `Together that maps to ${band} territory (${rating.toFixed(1)}/10). The wind, rain, and comfort lines below translate this into what you will feel on the course.`;

  return `${intro} ${middle} ${outro}`;
}

function recommendedActionText(
  level: PlayabilityLevel,
  rainRisk: RainRiskLevel,
  windImpact: WindImpactLevel,
  thunder: boolean,
  bestWindow: string | null,
  bestWindowFallback: string | null,
): string {
  if (thunder || rainRisk === "high") {
    return "Call the pro shop to confirm course status, tees, and any storm policy before you travel.";
  }
  if (windImpact === "extreme") {
    return bestWindow
      ? `If you can shift timing, try ${bestWindow} when wind may ease slightly — otherwise club for the breeze.`
      : "Consider a calmer day if you have flexibility — otherwise club for wind and manage expectations.";
  }
  if (level === "excellent" || level === "good") {
    return "Conditions look playable — still worth a quick call if competition or temps are marginal.";
  }
  if (rainRisk === "moderate") {
    return "Pack waterproofs and check the club for trolley or path restrictions.";
  }
  if (bestWindow) {
    return `Aim for ${bestWindow} if you can — that's your cleanest daytime window on the forecast.`;
  }
  if (bestWindowFallback) {
    return `${bestWindowFallback} Use the hourly strip to compare slots.`;
  }
  return "Scan the hourly strip below and plan around the lightest wind and lowest rain chance.";
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
      bestWindowFallback: "No clear daytime playing window",
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

  const warnings: string[] = [];
  if (windImpact === "extreme" || maxWind >= 45) {
    warnings.push("Very strong wind — expect big club and scoring variance.");
  } else if (windImpact === "high") {
    warnings.push("Breezy conditions — extra club on approaches and exposed holes.");
  }
  if (rainRisk === "high") {
    warnings.push("High rain or storm risk — confirm course status before travelling.");
  } else if (rainRisk === "moderate") {
    warnings.push("Some rain likely — pack waterproofs and expect softer lies.");
  }
  if (thunder) {
    warnings.push("Thunder in forecast — be ready to stop play if storms approach.");
  }
  if (comfort === "cold") {
    warnings.push("Cold start — allow warm-up time; ball may fly shorter.");
  }
  if (comfort === "hot") {
    warnings.push("Warm round — hydrate and consider pacing.");
  }

  const windSummary =
    windImpact === "low"
      ? "Light air — scoring conditions generally friendly."
      : windImpact === "moderate"
        ? "Moderate wind — factor into clubbing and putting."
        : windImpact === "high"
          ? "Strong wind — priority on ball flight and course management."
          : "Extreme wind — marginal golf day unless you enjoy the challenge.";

  const rainSummary =
    rainRisk === "low"
      ? "Limited rain signal — fair chance of a dry window."
      : rainRisk === "moderate"
        ? "Showers possible — watch radar and club updates."
        : "Wet pattern — trolley bans or temp greens may apply.";

  const comfortSummary =
    comfort === "mild" || comfort === "cool"
      ? "Comfortable temperatures for walking 18."
      : comfort === "cold"
        ? "Cool conditions — extra layer recommended."
        : comfort === "warm" || comfort === "hot"
          ? "Warm on the fairways — sun protection and fluids."
          : "Mild playing temperatures overall.";

  const summaryParts: string[] = [];
  if (level === "excellent" || level === "good") {
    summaryParts.push("Favourable window for golf if the course is open.");
  } else if (level === "mixed") {
    summaryParts.push("Playable but patchy — check wind and showers.");
  } else {
    summaryParts.push("Challenging conditions — worth confirming before you travel.");
  }
  if (rainRisk !== "low") summaryParts.push(rainSummary);
  else if (windImpact !== "low") summaryParts.push(windSummary);

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
  const ratingExplanation = buildRatingExplanation(
    rating,
    level,
    avgProb,
    maxProb,
    avgWind,
    maxWind,
    thunder,
    heavyCode,
    avgTemp,
  );

  return {
    rating,
    level,
    label,
    summary: summaryParts.join(" "),
    ratingExplanation,
    recommendedAction,
    warnings,
    windImpact,
    windSummary,
    rainRisk,
    rainSummary,
    comfort,
    comfortSummary,
    bestWindow,
    bestWindowFallback,
    targetDate: targetDateYmd,
  };
}
