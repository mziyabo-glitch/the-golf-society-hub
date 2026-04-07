/**
 * Forecast fetch + normalisation for in-app Weather.
 * Primary: OpenWeatherMap (EXPO_PUBLIC_WEATHER_API_KEY) — 2.5 forecast (free-tier friendly).
 * Fallback: Open-Meteo when no key or on provider error (robust dev / backup).
 */

import { getWeatherProviderId, WEATHER_API_KEY } from "@/lib/env";
import { buildOpenMeteoForecastUrl } from "./openMeteoWebProxy";
import type { DailyForecastPoint, HourlyForecastPoint, NormalizedForecast, WeatherProviderId } from "./types";

/** Map OpenWeather condition id → WMO-like code for shared playability heuristics */
export function owmConditionIdToPseudoWmo(id: number): number {
  if (id >= 200 && id < 300) return 95;
  if (id >= 300 && id < 400) return 53;
  if (id >= 500 && id < 600) return id >= 502 ? 65 : 61;
  if (id >= 600 && id < 700) return 71;
  if (id === 800) return 0;
  return 3;
}

type OwmForecastListItem = {
  dt: number;
  dt_txt: string;
  main?: { temp?: number; humidity?: number };
  wind?: { speed?: number };
  pop?: number;
  weather?: { id?: number }[];
};

type OwmForecastPayload = {
  list?: OwmForecastListItem[];
  city?: { timezone?: number };
};

function mpsToKmh(mps: number): number {
  return Math.max(0, mps * 3.6);
}

function normalizeOpenWeatherMap25(lat: number, lng: number, apiKey: string): Promise<NormalizedForecast> {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&appid=${encodeURIComponent(apiKey)}`;
  return fetch(url).then(async (res) => {
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Weather provider error (${res.status})${t ? `: ${t.slice(0, 120)}` : ""}`);
    }
    return res.json() as Promise<OwmForecastPayload>;
  }).then((json) => {
    const list = json.list ?? [];
    const hourly: HourlyForecastPoint[] = list.map((item) => {
      const dtTxt = item.dt_txt?.trim() || "";
      const dateYmdLocal = dtTxt.length >= 10 ? dtTxt.slice(0, 10) : new Date(item.dt * 1000).toISOString().slice(0, 10);
      const windMps = Number(item.wind?.speed ?? 0);
      const id = item.weather?.[0]?.id ?? 800;
      return {
        time: dtTxt.replace(" ", "T") || new Date(item.dt * 1000).toISOString(),
        dateYmdLocal,
        tempC: Number(item.main?.temp ?? 0),
        precipProbPercent: Math.min(100, Math.max(0, Math.round(Number(item.pop ?? 0) * 100))),
        windKmh: mpsToKmh(windMps),
        weatherCode: owmConditionIdToPseudoWmo(Number(id)),
        humidityPercent: Math.min(100, Math.max(0, Number(item.main?.humidity ?? 60))),
      };
    });

    const dailyMap = new Map<
      string,
      { min: number; max: number; pmax: number; wmax: number; codes: number[]; codeMax: number }
    >();
    for (const h of hourly) {
      const d = h.dateYmdLocal;
      const cur = dailyMap.get(d) ?? {
        min: h.tempC,
        max: h.tempC,
        pmax: 0,
        wmax: 0,
        codes: [],
        codeMax: 0,
      };
      cur.min = Math.min(cur.min, h.tempC);
      cur.max = Math.max(cur.max, h.tempC);
      cur.pmax = Math.max(cur.pmax, h.precipProbPercent);
      cur.wmax = Math.max(cur.wmax, h.windKmh);
      cur.codes.push(h.weatherCode);
      cur.codeMax = Math.max(cur.codeMax, h.weatherCode);
      dailyMap.set(d, cur);
    }

    const daily: DailyForecastPoint[] = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 7)
      .map(([dateYmd, v]) => {
        const storm = v.codes.some((c) => c >= 95);
        const wet = v.pmax >= 55;
        let summary = "Typical day for golf.";
        if (storm) summary = "Storm risk — check before you travel.";
        else if (wet) summary = "Wet spell possible — pack waterproofs.";
        else if (v.wmax >= 40) summary = "Windy — club up and manage ball flight.";
        return {
          dateYmd,
          tempMinC: Math.round(v.min * 10) / 10,
          tempMaxC: Math.round(v.max * 10) / 10,
          precipProbMaxPercent: v.pmax,
          windMaxKmh: Math.round(v.wmax * 10) / 10,
          summary,
          sunrise: null,
          sunset: null,
        };
      });

    return {
      provider: "openweathermap" as WeatherProviderId,
      providerLabel: "OpenWeatherMap",
      timezone: json.city?.timezone != null ? `UTC${json.city.timezone >= 0 ? "+" : ""}${json.city.timezone / 3600}` : null,
      hourly,
      daily,
    };
  });
}

type OpenMeteoHourly = {
  time?: string[];
  temperature_2m?: number[];
  precipitation_probability?: number[];
  /** Current API name (km/h with default units). */
  wind_speed_10m?: number[];
  /** Legacy alias — keep while parsing old responses. */
  windspeed_10m?: number[];
  weathercode?: number[];
  relative_humidity_2m?: number[];
};

type OpenMeteoDaily = {
  time?: string[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: number[];
  wind_speed_10m_max?: number[];
  windspeed_10m_max?: number[];
  weathercode?: number[];
  sunrise?: string[];
  sunset?: string[];
};

function normalizeOpenMeteo(lat: number, lng: number): Promise<NormalizedForecast> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    wind_speed_unit: "kmh",
    hourly: [
      "temperature_2m",
      "precipitation_probability",
      "wind_speed_10m",
      "weathercode",
      "relative_humidity_2m",
    ].join(","),
    daily: [
      "weathercode",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "sunrise",
      "sunset",
    ].join(","),
    forecast_days: "7",
    timezone: "auto",
  });

  const url = buildOpenMeteoForecastUrl(params);
  return fetch(url).then(async (res) => {
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const reason =
        json && typeof json.reason === "string"
          ? json.reason
          : typeof json?.error === "string"
            ? json.error
            : "";
      throw new Error(
        reason
          ? `Open-Meteo error (${res.status}): ${reason}`
          : `Weather request failed (${res.status})`,
      );
    }
    return json;
  }).then((json: any) => {
    if (json?.error === true) {
      const reason = typeof json?.reason === "string" ? json.reason : "Unknown API error";
      throw new Error(`Open-Meteo: ${reason}`);
    }
    const hourlyRaw = json?.hourly as OpenMeteoHourly | undefined;
    const dailyRaw = json?.daily as OpenMeteoDaily | undefined;
    const times = hourlyRaw?.time ?? [];
    const temps = hourlyRaw?.temperature_2m ?? [];
    const pprob = hourlyRaw?.precipitation_probability ?? [];
    const wind = hourlyRaw?.wind_speed_10m ?? hourlyRaw?.windspeed_10m ?? [];
    const codes = hourlyRaw?.weathercode ?? [];
    const hum = hourlyRaw?.relative_humidity_2m ?? [];

    const hourly: HourlyForecastPoint[] = [];
    for (let i = 0; i < times.length; i++) {
      const time = times[i];
      const dateYmdLocal = typeof time === "string" && time.length >= 10 ? time.slice(0, 10) : "";
      hourly.push({
        time,
        dateYmdLocal,
        tempC: Number(temps[i] ?? 0),
        precipProbPercent: Math.min(100, Math.max(0, Number(pprob[i] ?? 0))),
        windKmh: Math.max(0, Number(wind[i] ?? 0)),
        weatherCode: Math.round(Number(codes[i] ?? 0)),
        humidityPercent: Math.min(100, Math.max(0, Number(hum[i] ?? 50))),
      });
    }

    const dTimes = dailyRaw?.time ?? [];
    const dMax = dailyRaw?.temperature_2m_max ?? [];
    const dMin = dailyRaw?.temperature_2m_min ?? [];
    const dP = dailyRaw?.precipitation_probability_max ?? [];
    const dW = dailyRaw?.wind_speed_10m_max ?? dailyRaw?.windspeed_10m_max ?? [];
    const dCode = dailyRaw?.weathercode ?? [];
    const dSunrise = dailyRaw?.sunrise ?? [];
    const dSunset = dailyRaw?.sunset ?? [];

    const daily: DailyForecastPoint[] = [];
    for (let i = 0; i < dTimes.length; i++) {
      const dateYmd = typeof dTimes[i] === "string" ? dTimes[i].slice(0, 10) : "";
      const pmax = Math.min(100, Math.max(0, Number(dP[i] ?? 0)));
      const wmax = Math.max(0, Number(dW[i] ?? 0));
      const code = Math.round(Number(dCode[i] ?? 0));
      let summary = "Fair day.";
      if (code >= 95) summary = "Storm risk.";
      else if (pmax >= 55) summary = "Wet spell.";
      else if (wmax >= 40) summary = "Very windy.";
      const sr = typeof dSunrise[i] === "string" ? dSunrise[i] : null;
      const ss = typeof dSunset[i] === "string" ? dSunset[i] : null;
      daily.push({
        dateYmd,
        tempMinC: Math.round(Number(dMin[i] ?? 0) * 10) / 10,
        tempMaxC: Math.round(Number(dMax[i] ?? 0) * 10) / 10,
        precipProbMaxPercent: pmax,
        windMaxKmh: Math.round(wmax * 10) / 10,
        weatherCode: code,
        summary,
        sunrise: sr,
        sunset: ss,
      });
    }

    return {
      provider: "open-meteo" as WeatherProviderId,
      providerLabel: "Open-Meteo",
      timezone: typeof json?.timezone === "string" ? json.timezone : null,
      hourly,
      daily,
    };
  });
}

/**
 * Single entry: keyed provider + normalised hourly/daily for UI + playability.
 */
export async function fetchNormalizedForecast(lat: number, lng: number): Promise<NormalizedForecast> {
  const wantOwm = getWeatherProviderId() === "openweathermap" && WEATHER_API_KEY.length > 0;
  if (wantOwm) {
    try {
      return await normalizeOpenWeatherMap25(lat, lng, WEATHER_API_KEY);
    } catch (e) {
      console.warn("[weatherService] OpenWeatherMap failed, falling back to Open-Meteo:", e);
    }
  }
  return normalizeOpenMeteo(lat, lng);
}

/**
 * Open-Meteo daily sunrise/sunset for one date (venue-local). Used when the active forecast
 * payload omits sun times (e.g. OpenWeatherMap path).
 */
export async function fetchSunriseSunsetForYmd(
  lat: number,
  lng: number,
  ymd: string,
): Promise<{ sunrise: string; sunset: string } | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: "sunrise,sunset",
    timezone: "auto",
    start_date: ymd,
    end_date: ymd,
  });
  const url = buildOpenMeteoForecastUrl(params);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      daily?: { sunrise?: string[]; sunset?: string[] };
    };
    const sr = json?.daily?.sunrise?.[0];
    const ss = json?.daily?.sunset?.[0];
    if (typeof sr === "string" && typeof ss === "string" && sr.length > 0 && ss.length > 0) {
      return { sunrise: sr, sunset: ss };
    }
  } catch {
    return null;
  }
  return null;
}
