/**
 * Pure golf playability evaluation for a bounded hourly forecast window.
 * No browser globals — safe on React Native / server.
 */

import {
  applyHardStops,
  computeWindChillC,
  getCountryProfile,
  type CountryPlayabilityProfile,
  type PlayabilitySignals,
  type ProfileRuleHit,
  type RuleSeverity,
} from "./playabilityProfiles";
export type PlayabilityStatus = "PLAY" | "MARGINAL" | "CAUTION" | "NO_PLAY" | "UNKNOWN";

export type RoundHourSample = {
  timeIso: string;
  windKmh: number | null;
  gustKmh: number | null;
  /** Liquid equivalent mm/h (Open-Meteo `precipitation`) */
  precipMmPerH: number | null;
  precipProbabilityPct: number | null;
  tempC: number | null;
  apparentTempC: number | null;
  weatherCode: number | null;
};

export type EvaluateRoundWindowInput = {
  /** Optional ISO country hint — defaults inside getCountryProfile */
  countryCode?: string | null;
  /** Pre-filtered hourly rows covering the intended round window */
  hourly: RoundHourSample[];
};

export type PlayabilityMetrics = {
  windKmh: number | null;
  gustKmh: number | null;
  rainMmPerH: number | null;
  rainProbabilityPct: number | null;
  tempC: number | null;
  feelsLikeC: number | null;
  windChillC: number | null;
};

export type PlayabilityDebug = {
  profileCode: string;
  signals: {
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
  ruleHits: { severity: RuleSeverity; reason: string }[];
  usableHourCount: number;
}

export type PlayabilityEngineOutput = {
  status: PlayabilityStatus;
  statusLabel: string;
  icon: string;
  message: string;
  reasons: string[];
  score: number | null;
  metrics: PlayabilityMetrics;
  windRainSummary: string;
  debug: PlayabilityDebug;
};

const RULE_ORDER: Record<RuleSeverity, number> = {
  MARGINAL: 1,
  CAUTION: 2,
  NO_PLAY: 3,
};

export function playabilityStatusLabel(status: PlayabilityStatus): string {
  switch (status) {
    case "PLAY":
      return "Good to play";
    case "MARGINAL":
      return "Marginal";
    case "CAUTION":
      return "Caution";
    case "NO_PLAY":
      return "Not advisable";
    case "UNKNOWN":
    default:
      return "No forecast";
  }
}

/** Feather icon name (expo vector) */
export function playabilityIcon(status: PlayabilityStatus): string {
  switch (status) {
    case "PLAY":
      return "sun";
    case "MARGINAL":
      return "cloud";
    case "CAUTION":
      return "cloud-drizzle";
    case "NO_PLAY":
      return "alert-triangle";
    case "UNKNOWN":
    default:
      return "help-circle";
  }
}

export function playabilityMessage(status: PlayabilityStatus, reasons: string[]): string {
  if (status === "UNKNOWN") {
    return reasons[0] ?? "Forecast is not available for this round yet.";
  }
  if (status === "PLAY") {
    return reasons[0] ?? "Conditions look reasonable for golf.";
  }
  const top = reasons.filter(Boolean).slice(0, 3);
  if (top.length === 0) {
    return "Review conditions before you tee off.";
  }
  return top.join(" · ");
}

export function formatWindRainSummary(metrics: PlayabilityMetrics): string {
  const w = metrics.windKmh;
  const g = metrics.gustKmh;
  const r = metrics.rainMmPerH;
  const parts: string[] = [];
  if (w != null && Number.isFinite(w)) {
    const gustBit = g != null && Number.isFinite(g) && g > w ? `, gusts to ${Math.round(g)} km/h` : "";
    parts.push(`Wind to ${Math.round(w)} km/h${gustBit}`);
  }
  if (r != null && Number.isFinite(r) && r > 0) {
    parts.push(`Rain up to ${r.toFixed(1)} mm/h`);
  } else {
    parts.push("Little or no rain in the window");
  }
  return parts.join(" · ");
}

function maxRuleSeverity(a: RuleSeverity, b: RuleSeverity): RuleSeverity {
  return RULE_ORDER[a] >= RULE_ORDER[b] ? a : b;
}

function mergeStatus(a: PlayabilityStatus, b: PlayabilityStatus): PlayabilityStatus {
  const rank: Record<PlayabilityStatus, number> = {
    UNKNOWN: -1,
    PLAY: 0,
    MARGINAL: 1,
    CAUTION: 2,
    NO_PLAY: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

function dedupeReasons(reasons: string[], max = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of reasons) {
    const k = r.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= max) break;
  }
  return out;
}

function hasUsableForecast(samples: RoundHourSample[]): boolean {
  if (samples.length === 0) return false;
  return samples.some(
    (s) =>
      (s.windKmh != null && Number.isFinite(s.windKmh)) ||
      (s.gustKmh != null && Number.isFinite(s.gustKmh)) ||
      (s.tempC != null && Number.isFinite(s.tempC)) ||
      (s.precipMmPerH != null && Number.isFinite(s.precipMmPerH)) ||
      (s.weatherCode != null && Number.isFinite(s.weatherCode)),
  );
}

function deriveSignals(samples: RoundHourSample[], profile: CountryPlayabilityProfile): PlayabilitySignals {
  let thunder = false;
  let snowOrIce = false;
  let maxWind: number | null = null;
  let maxGust: number | null = null;
  let maxDelta: number | null = null;
  let maxRain: number | null = null;
  let maxProb: number | null = null;
  let minTemp: number | null = null;
  let minFeels: number | null = null;
  let minWc: number | null = null;

  for (const s of samples) {
    const code = s.weatherCode;
    if (code === 95 || code === 96 || code === 99) thunder = true;
    if (
      code === 56 ||
      code === 57 ||
      (code != null && code >= 71 && code <= 77) ||
      code === 85 ||
      code === 86
    ) {
      snowOrIce = true;
    }

    const w = s.windKmh;
    const g = s.gustKmh;
    if (w != null && Number.isFinite(w)) {
      maxWind = maxWind == null ? w : Math.max(maxWind, w);
    }
    if (g != null && Number.isFinite(g)) {
      maxGust = maxGust == null ? g : Math.max(maxGust, g);
    }
    if (w != null && g != null && Number.isFinite(w) && Number.isFinite(g)) {
      const d = Math.max(0, g - w);
      maxDelta = maxDelta == null ? d : Math.max(maxDelta, d);
    }

    const p = s.precipMmPerH;
    if (p != null && Number.isFinite(p) && p > 0) {
      maxRain = maxRain == null ? p : Math.max(maxRain, p);
    }
    const pr = s.precipProbabilityPct;
    if (pr != null && Number.isFinite(pr)) {
      maxProb = maxProb == null ? pr : Math.max(maxProb, pr);
    }

    const t = s.tempC;
    if (t != null && Number.isFinite(t)) {
      minTemp = minTemp == null ? t : Math.min(minTemp, t);
    }
    const ap = s.apparentTempC;
    if (ap != null && Number.isFinite(ap)) {
      minFeels = minFeels == null ? ap : Math.min(minFeels, ap);
    }

    const wc = computeWindChillC(s.tempC, s.windKmh);
    if (wc != null && Number.isFinite(wc)) {
      minWc = minWc == null ? wc : Math.min(minWc, wc);
    }
  }

  return {
    thunder,
    snowOrIce,
    maxWindKmh: maxWind,
    maxGustKmh: maxGust,
    maxGustDeltaKmh: maxDelta,
    maxRainMmPerH: maxRain,
    maxRainProbPct: maxProb,
    minTempC: minTemp,
    minFeelsLikeC: minFeels,
    minWindChillC: minWc,
  };
}

function windAndChillRules(profile: CountryPlayabilityProfile, sig: PlayabilitySignals): ProfileRuleHit[] {
  const hits: ProfileRuleHit[] = [];
  const w = sig.maxWindKmh;
  const g = sig.maxGustKmh;
  const d = sig.maxGustDeltaKmh;
  const wc = sig.minWindChillC;

  if (w != null) {
    if (w >= profile.windNoPlayKmh) {
      hits.push({ severity: "NO_PLAY", reason: `Very strong sustained wind (to ${Math.round(w)} km/h)` });
    } else if (w >= profile.windCautionKmh) {
      hits.push({ severity: "CAUTION", reason: `Strong sustained wind (to ${Math.round(w)} km/h)` });
    } else if (w >= profile.windMarginalKmh) {
      hits.push({ severity: "MARGINAL", reason: `Breezy conditions (to ${Math.round(w)} km/h)` });
    }
  }

  if (g != null) {
    if (g >= profile.gustNoPlayKmh) {
      hits.push({ severity: "NO_PLAY", reason: `Dangerous gusts (to ${Math.round(g)} km/h)` });
    } else if (g >= profile.gustCautionKmh) {
      hits.push({ severity: "CAUTION", reason: `Strong gusts (to ${Math.round(g)} km/h)` });
    }
  }

  if (d != null) {
    if (d >= profile.gustDeltaNoPlayKmh) {
      hits.push({ severity: "NO_PLAY", reason: "Very gusty lulls — hard to control ball flight" });
    } else if (d >= profile.gustDeltaCautionKmh) {
      hits.push({ severity: "CAUTION", reason: "Sharp gusts relative to base wind" });
    } else if (d >= profile.gustDeltaMarginalKmh) {
      hits.push({ severity: "MARGINAL", reason: "Noticeable gust variability" });
    }
  }

  if (wc != null) {
    if (wc <= profile.windChillNoPlayC) {
      hits.push({ severity: "NO_PLAY", reason: `Cold wind exposure (wind chill near ${Math.round(wc)}°C)` });
    } else if (wc <= profile.windChillCautionC) {
      hits.push({ severity: "CAUTION", reason: `Chilly wind chill (near ${Math.round(wc)}°C)` });
    } else if (wc <= profile.windChillMarginalC) {
      hits.push({ severity: "MARGINAL", reason: `Cool feel in the wind (near ${Math.round(wc)}°C)` });
    }
  }

  return hits;
}

/**
 * Rain rules — high POP alone cannot create a heavy-rain tier without meaningful mm/h.
 */
function rainRules(profile: CountryPlayabilityProfile, sig: PlayabilitySignals): ProfileRuleHit[] {
  const hits: ProfileRuleHit[] = [];
  const mm = sig.maxRainMmPerH;
  const prob = sig.maxRainProbPct;

  const meaningful = profile.heavyRainMinMmForProbEscalation;
  const hasMeaningfulMm = mm != null && mm >= meaningful;
  const popSupports = prob != null && prob >= profile.heavyRainProbWithMeaningfulMm && hasMeaningfulMm;

  if (mm != null && mm >= profile.heavyRainMmPerH) {
    hits.push({ severity: "NO_PLAY", reason: `Heavy rain rates (to ${mm.toFixed(1)} mm/h)` });
  } else if (mm != null && mm >= profile.moderateRainMmPerH) {
    hits.push({ severity: "CAUTION", reason: `Wet fairways likely (to ${mm.toFixed(1)} mm/h)` });
  } else if (mm != null && mm > profile.lightRainCeilingMmPerH) {
    hits.push({ severity: "MARGINAL", reason: `Some steady rain possible (to ${mm.toFixed(1)} mm/h)` });
  } else if (popSupports && mm != null && mm >= profile.lightRainCeilingMmPerH * 0.55) {
    // Probable wetting only when mm is already non-trivial
    hits.push({ severity: "MARGINAL", reason: "Rain likely at times during the window" });
  }

  // High POP with trace rain — explicit soft note only at marginal tier, never as heavy rain
  if (!hasMeaningfulMm && prob != null && prob >= 85 && (mm == null || mm < meaningful)) {
    // do not add heavy / caution rain from POP alone (requirement)
    hits.push({ severity: "MARGINAL", reason: "High rain chance but only light amounts expected" });
  }

  return hits;
}

function worstRuleSeverity(hits: ProfileRuleHit[]): RuleSeverity | null {
  if (hits.length === 0) return null;
  let worst = hits[0]!.severity;
  for (let i = 1; i < hits.length; i++) {
    worst = maxRuleSeverity(worst, hits[i]!.severity);
  }
  return worst;
}

function computeScore(profile: CountryPlayabilityProfile, sig: PlayabilitySignals, status: PlayabilityStatus): number | null {
  if (status === "UNKNOWN") return null;

  let s = 100;

  const w = sig.maxWindKmh ?? 0;
  s -= Math.min(22, Math.max(0, (w - 18) * 0.45));

  const delta = sig.maxGustDeltaKmh ?? 0;
  s -= Math.min(18, Math.max(0, (delta - 8) * 0.55));

  const g = sig.maxGustKmh ?? 0;
  s -= Math.min(16, Math.max(0, (g - 48) * 0.35));

  const mm = sig.maxRainMmPerH ?? 0;
  s -= Math.min(38, mm * 10);

  const wc = sig.minWindChillC;
  if (wc != null && wc < profile.windChillMarginalC) {
    s -= Math.min(24, Math.max(0, (profile.windChillMarginalC - wc) * 2.2));
  }

  if (sig.thunder) s -= 55;
  if (sig.snowOrIce) s -= 45;

  if (!Number.isFinite(s)) return null;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function buildMetrics(sig: PlayabilitySignals): PlayabilityMetrics {
  return {
    windKmh: sig.maxWindKmh,
    gustKmh: sig.maxGustKmh,
    rainMmPerH: sig.maxRainMmPerH,
    rainProbabilityPct: sig.maxRainProbPct,
    tempC: sig.minTempC,
    feelsLikeC: sig.minFeelsLikeC,
    windChillC: sig.minWindChillC,
  };
}

/**
 * Evaluate playability for a pre-built hourly window (pure).
 */
export function evaluateRoundWindow(input: EvaluateRoundWindowInput): PlayabilityEngineOutput {
  const profile = getCountryProfile(input.countryCode);
  const samples = input.hourly ?? [];

  if (!hasUsableForecast(samples)) {
    const reasons = dedupeReasons(
      [
        samples.length === 0
          ? "No hourly data in the forecast window."
          : "Forecast fields were missing for this window.",
      ],
      3,
    );
    const metrics: PlayabilityMetrics = {
      windKmh: null,
      gustKmh: null,
      rainMmPerH: null,
      rainProbabilityPct: null,
      tempC: null,
      feelsLikeC: null,
      windChillC: null,
    };
    const status: PlayabilityStatus = "UNKNOWN";
    return {
      status,
      statusLabel: playabilityStatusLabel(status),
      icon: playabilityIcon(status),
      message: playabilityMessage(status, reasons),
      reasons,
      score: null,
      metrics,
      windRainSummary: formatWindRainSummary(metrics),
      debug: {
        profileCode: profile.countryCode,
        signals: {
          thunder: false,
          snowOrIce: false,
          maxWindKmh: null,
          maxGustKmh: null,
          maxGustDeltaKmh: null,
          maxRainMmPerH: null,
          maxRainProbPct: null,
          minTempC: null,
          minFeelsLikeC: null,
          minWindChillC: null,
        },
        ruleHits: [],
        usableHourCount: 0,
      },
    };
  }

  const signals = deriveSignals(samples, profile);
  const hits: ProfileRuleHit[] = [
    ...applyHardStops(signals),
    ...windAndChillRules(profile, signals),
    ...rainRules(profile, signals),
  ];

  const worst = worstRuleSeverity(hits);
  let status: PlayabilityStatus = worst != null ? worst : "PLAY";

  // If thunder/snow hard stops somehow missed but flags set — belt and braces
  if (signals.thunder || signals.snowOrIce) {
    status = mergeStatus(status, "NO_PLAY");
  }

  const sortedHits = [...hits].sort((a, b) => RULE_ORDER[b.severity] - RULE_ORDER[a.severity]);
  const topReasons = dedupeReasons(
    sortedHits.map((h) => h.reason),
    3,
  );

  // UNKNOWN must never be treated as favourable: if we are UNKNOWN, score stays null (handled above).
  // When data exists but rules empty, PLAY.
  const reasons =
    status === "PLAY"
      ? dedupeReasons(["Conditions look reasonable for golf in this window."], 3)
      : topReasons.length > 0
        ? topReasons
        : dedupeReasons(["Review conditions before you tee off."], 3);

  const score = computeScore(profile, signals, status);
  const metrics = buildMetrics(signals);

  return {
    status,
    statusLabel: playabilityStatusLabel(status),
    icon: playabilityIcon(status),
    message: playabilityMessage(status, reasons),
    reasons,
    score,
    metrics,
    windRainSummary: formatWindRainSummary(metrics),
    debug: {
      profileCode: profile.countryCode,
      signals: {
        thunder: signals.thunder,
        snowOrIce: signals.snowOrIce,
        maxWindKmh: signals.maxWindKmh,
        maxGustKmh: signals.maxGustKmh,
        maxGustDeltaKmh: signals.maxGustDeltaKmh,
        maxRainMmPerH: signals.maxRainMmPerH,
        maxRainProbPct: signals.maxRainProbPct,
        minTempC: signals.minTempC,
        minFeelsLikeC: signals.minFeelsLikeC,
        minWindChillC: signals.minWindChillC,
      },
      ruleHits: hits.map((h) => ({ severity: h.severity, reason: h.reason })),
      usableHourCount: samples.length,
    },
  };
}
