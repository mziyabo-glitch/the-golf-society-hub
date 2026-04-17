/**
 * Forecast fetch + calendar helpers for round playability wiring.
 * User-facing strings for evaluated output live in playabilityEngine (re-exported below).
 */

export type FetchedHourRow = {
  timeIso: string;
  windKmh: number | null;
  gustKmh: number | null;
  precipMmPerH: number | null;
  precipProbabilityPct: number | null;
  tempC: number | null;
  apparentTempC: number | null;
  weatherCode: number | null;
};

type OpenMeteoHourlyPayload = {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    precipitation?: (number | null)[];
    precipitation_probability?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    weather_code?: (number | null)[];
  };
};

/**
 * Hourly rows for a calendar day at the course (Open-Meteo, km/h winds).
 * Returns [] on network/shape failure (caller should treat as missing forecast).
 */
export async function fetchOpenMeteoHourlyForEventDate(params: {
  latitude: number;
  longitude: number;
  dateYyyyMmDd: string;
}): Promise<FetchedHourRow[]> {
  const { latitude, longitude, dateYyyyMmDd } = params;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !dateYyyyMmDd) return [];

  const qs = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "precipitation_probability",
      "wind_speed_10m",
      "wind_gusts_10m",
      "weather_code",
    ].join(","),
    start_date: dateYyyyMmDd,
    end_date: dateYyyyMmDd,
    wind_speed_unit: "kmh",
    timezone: "auto",
  });

  const url = `https://api.open-meteo.com/v1/forecast?${qs.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as OpenMeteoHourlyPayload;
    const h = json.hourly;
    const times = h?.time ?? [];
    if (!Array.isArray(times) || times.length === 0) return [];

    const out: FetchedHourRow[] = [];
    for (let i = 0; i < times.length; i++) {
      out.push({
        timeIso: String(times[i] ?? ""),
        windKmh: numOrNull(h?.wind_speed_10m?.[i]),
        gustKmh: numOrNull(h?.wind_gusts_10m?.[i]),
        precipMmPerH: numOrNull(h?.precipitation?.[i]),
        precipProbabilityPct: numOrNull(h?.precipitation_probability?.[i]),
        tempC: numOrNull(h?.temperature_2m?.[i]),
        apparentTempC: numOrNull(h?.apparent_temperature?.[i]),
        weatherCode: intOrNull(h?.weather_code?.[i]),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  return n == null ? null : Math.trunc(n);
}

/**
 * Keep typical daylight golf hours using the hour digit from Open-Meteo `time` strings
 * (with `timezone=auto`, times are wall-clock at the course).
 */
export function filterLocalDaytimeHours<T extends { timeIso: string }>(samples: T[]): T[] {
  if (!samples.length) return samples;
  return samples.filter((s) => {
    const m = /T(\d{2}):/.exec(s.timeIso);
    const hour = m ? parseInt(m[1], 10) : NaN;
    if (!Number.isFinite(hour)) return true;
    return hour >= 6 && hour <= 20;
  });
}

/** Forecast API supports roughly the next 16 days for standard forecast. */
export function isLikelyForecastableEventDate(dateYyyyMmDd: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYyyyMmDd.trim());
  if (!m) return false;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const target = new Date(y, mo, d);
  if (!Number.isFinite(target.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 15);
  return target >= today && target <= limit;
}

export {
  formatWindRainSummary,
  playabilityIcon,
  playabilityMessage,
  playabilityStatusLabel,
} from "./playabilityEngine";
