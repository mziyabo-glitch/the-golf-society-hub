/**
 * GolfCourseAPI key (`Authorization: Key <value>`).
 * Prefer explicit GOLFCOURSE_* names; keep legacy GOLF_* for existing .env files.
 */
export const GOLF_API_KEY =
  process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY ||
  process.env.GOLFCOURSE_API_KEY ||
  process.env.EXPO_PUBLIC_GOLF_API_KEY ||
  process.env.NEXT_PUBLIC_GOLF_API_KEY ||
  "";

/** OpenWeatherMap (or compatible) — enables in-app forecast when set. Falls back to Open-Meteo when empty. */
export const WEATHER_API_KEY =
  process.env.EXPO_PUBLIC_WEATHER_API_KEY || process.env.WEATHER_API_KEY || "";

/**
 * `openweathermap` — EXPO_PUBLIC_WEATHER_API_KEY + 2.5/3.0 forecast APIs
 * `open-meteo` — force free Open-Meteo (ignores key)
 */
export function getWeatherProviderId(): "openweathermap" | "open-meteo" {
  const raw = process.env.EXPO_PUBLIC_WEATHER_PROVIDER?.toLowerCase().trim();
  if (raw === "open-meteo" || raw === "openmeteo") return "open-meteo";
  if (WEATHER_API_KEY.length > 0) return "openweathermap";
  return "open-meteo";
}

console.log("Golf API key loaded:", !!GOLF_API_KEY);
console.log("Weather API key loaded:", !!WEATHER_API_KEY);
