/**
 * Golf playability — decision-focused outputs derived from forecast + course context.
 */

export type PlayabilityLevel = "excellent" | "good" | "mixed" | "poor" | "severe";

export type WindImpactLevel = "low" | "moderate" | "high" | "extreme";

export type RainRiskLevel = "low" | "moderate" | "high";

export type ComfortLevel = "cold" | "cool" | "mild" | "warm" | "hot";

export type WeatherProviderId = "openweathermap" | "open-meteo";

export type PlayabilityInsight = {
  /** 1–10 aggregate score */
  rating: number;
  level: PlayabilityLevel;
  /** Short headline, e.g. "Good to go" */
  label: string;
  /** One-line captain’s-view summary */
  summary: string;
  /** Transparent plain-English: how rain, wind, codes, and temperature produced the score */
  ratingExplanation: string;
  /** Plain-English next step */
  recommendedAction: string;
  /** Actionable cautions (wind, lightning proxy, saturation, etc.) */
  warnings: string[];
  windImpact: WindImpactLevel;
  windSummary: string;
  rainRisk: RainRiskLevel;
  rainSummary: string;
  comfort: ComfortLevel;
  comfortSummary: string;
  /** Best contiguous window on the target day, local time labels (daylight-only) */
  bestWindow: string | null;
  /** When no safe daytime window is derived (e.g. tight daylight or missing sun data) */
  bestWindowFallback: string | null;
  /** YYYY-MM-DD this insight applies to (event day or “today”) */
  targetDate: string;
};

/** Normalised hour — comparable across providers */
export type HourlyForecastPoint = {
  /** ISO-like local time from provider (e.g. Open-Meteo) or OWM dt_txt */
  time: string;
  /** Local calendar date at the venue (YYYY-MM-DD) for filtering */
  dateYmdLocal: string;
  tempC: number;
  precipProbPercent: number;
  windKmh: number;
  /** WMO-style or mapped code for playability heuristics */
  weatherCode: number;
  humidityPercent: number;
};

export type DailyForecastPoint = {
  dateYmd: string;
  tempMinC: number;
  tempMaxC: number;
  precipProbMaxPercent: number;
  windMaxKmh: number;
  /** Short human line for the day */
  summary: string;
  /** Local ISO-like time from provider (e.g. Open-Meteo daily sunrise) */
  sunrise?: string | null;
  sunset?: string | null;
};

/** Provider-agnostic bundle for UI + playability engine */
export type NormalizedForecast = {
  provider: WeatherProviderId;
  /** Human label for settings / debug */
  providerLabel: string;
  /** IANA timezone when known (OWM 3.x / some responses) */
  timezone: string | null;
  hourly: HourlyForecastPoint[];
  daily: DailyForecastPoint[];
};

export type ResolvedCourseCoords = {
  lat: number;
  lng: number;
  label: string;
  source: "course_db" | "golf_api" | "geocode";
};
