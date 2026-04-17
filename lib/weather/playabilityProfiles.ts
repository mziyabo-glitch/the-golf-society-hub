/**
 * Country / climate profiles for golf playability thresholds.
 * UK defaults: a bit more tolerant of light rain; stricter on gust deltas and wind chill.
 */

export type CountryPlayabilityProfile = {
  /** ISO 3166-1 alpha-2 upper */
  countryCode: string;
  /** Sustained wind (km/h) — marginal / caution / no-play */
  windMarginalKmh: number;
  windCautionKmh: number;
  windNoPlayKmh: number;
  /** Peak gust (km/h) */
  gustCautionKmh: number;
  gustNoPlayKmh: number;
  /** Gust minus sustained (km/h) — UK: stricter */
  gustDeltaMarginalKmh: number;
  gustDeltaCautionKmh: number;
  gustDeltaNoPlayKmh: number;
  /** Wind chill (°C) — stricter in UK */
  windChillMarginalC: number;
  windChillCautionC: number;
  windChillNoPlayC: number;
  /** Light rain: at or below this peak mm/h we do not escalate past marginal */
  lightRainCeilingMmPerH: number;
  moderateRainMmPerH: number;
  heavyRainMmPerH: number;
  /**
   * High POP must pair with at least this mm/h before any “heavy rain” style rule fires.
   * Prevents “90% POP + trace rain” from behaving like a washout.
   */
  heavyRainMinMmForProbEscalation: number;
  /** If mm meets heavyRainMinMmForProbEscalation, this POP (%) can add a caution tier */
  heavyRainProbWithMeaningfulMm: number;
};

const UK_PROFILE: CountryPlayabilityProfile = {
  countryCode: "GB",
  windMarginalKmh: 34,
  windCautionKmh: 44,
  windNoPlayKmh: 54,
  gustCautionKmh: 62,
  gustNoPlayKmh: 76,
  gustDeltaMarginalKmh: 14,
  gustDeltaCautionKmh: 22,
  gustDeltaNoPlayKmh: 32,
  windChillMarginalC: 3,
  windChillCautionC: -1,
  windChillNoPlayC: -6,
  lightRainCeilingMmPerH: 1.1,
  moderateRainMmPerH: 2.2,
  heavyRainMmPerH: 4,
  heavyRainMinMmForProbEscalation: 0.45,
  heavyRainProbWithMeaningfulMm: 72,
};

const DEFAULT_PROFILE: CountryPlayabilityProfile = {
  countryCode: "DEFAULT",
  windMarginalKmh: 36,
  windCautionKmh: 46,
  windNoPlayKmh: 56,
  gustCautionKmh: 64,
  gustNoPlayKmh: 78,
  gustDeltaMarginalKmh: 16,
  gustDeltaCautionKmh: 24,
  gustDeltaNoPlayKmh: 34,
  windChillMarginalC: 2,
  windChillCautionC: -2,
  windChillNoPlayC: -8,
  lightRainCeilingMmPerH: 0.9,
  moderateRainMmPerH: 2.4,
  heavyRainMmPerH: 4.5,
  heavyRainMinMmForProbEscalation: 0.5,
  heavyRainProbWithMeaningfulMm: 75,
};

/**
 * Resolve thresholds from a coarse country hint (society / course locale).
 * Unknown → DEFAULT (still reasonable golf defaults).
 */
export function getCountryProfile(countryCode: string | null | undefined): CountryPlayabilityProfile {
  const c = (countryCode ?? "").trim().toUpperCase();
  if (c === "GB" || c === "UK") return { ...UK_PROFILE, countryCode: "GB" };
  return { ...DEFAULT_PROFILE };
}

/**
 * Wind-chill-style “feels” temperature (°C) from air temperature and wind.
 * Uses the common North American / UK-style approximation (valid ~-50 to +10 °C, wind ≥ 4.8 km/h).
 * Returns null when inputs are unusable.
 */
export function computeWindChillC(tempC: number | null | undefined, windKmh: number | null | undefined): number | null {
  if (tempC == null || !Number.isFinite(tempC)) return null;
  if (windKmh == null || !Number.isFinite(windKmh) || windKmh < 0) return null;
  const v = Math.pow(Math.min(Math.max(windKmh, 0), 120), 0.16);
  if (tempC > 10) {
    // Above the usual wind-chill validity band — return a mild “exposed” feel, not a hard WC.
    return tempC - windKmh * 0.02;
  }
  if (windKmh < 4.8) return tempC;
  const twc = 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v;
  if (!Number.isFinite(twc)) return null;
  return twc;
}

export type PlayabilitySignals = {
  thunder: boolean;
  snowOrIce: boolean;
  maxWindKmh: number | null;
  maxGustKmh: number | null;
  maxGustDeltaKmh: number | null;
  maxRainMmPerH: number | null;
  maxRainProbPct: number | null;
  minTempC: number | null;
  minFeelsLikeC: number | null;
  minWindChillC: number | null;
};

export type RuleSeverity = "MARGINAL" | "CAUTION" | "NO_PLAY";

export type ProfileRuleHit = {
  severity: RuleSeverity;
  reason: string;
};

function isThunderCode(code: number | null | undefined): boolean {
  if (code == null || !Number.isFinite(code)) return false;
  const c = Math.trunc(code);
  return c === 95 || c === 96 || c === 99;
}

function isSnowOrIceCode(code: number | null | undefined): boolean {
  if (code == null || !Number.isFinite(code)) return false;
  const c = Math.trunc(code);
  if (c === 56 || c === 57) return true; // freezing drizzle / rain
  if (c >= 71 && c <= 77) return true; // snow
  if (c === 85 || c === 86) return true; // snow showers
  return false;
}

/**
 * Non-negotiable hazards (lightning / significant frozen precipitation).
 */
export function applyHardStops(signals: PlayabilitySignals): ProfileRuleHit[] {
  const hits: ProfileRuleHit[] = [];
  if (signals.thunder) {
    hits.push({ severity: "NO_PLAY", reason: "Thunderstorms in the forecast window" });
  }
  if (signals.snowOrIce) {
    hits.push({ severity: "NO_PLAY", reason: "Snow or ice risk in the forecast window" });
  }
  return hits;
}
