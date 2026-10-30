/**
 * Browser → Open-Meteo is fragile (CORS, intermittent 502s without CORS headers).
 * On web we call same-origin `/api/weather/*` (Vercel) or localhost:3001 in dev — see dev-api-server.
 */

import { Platform } from "react-native";

function isExpoWebDevBehindProxy(): boolean {
  if (typeof window === "undefined" || !window.location) return false;
  const { hostname, port } = window.location;
  return hostname === "localhost" && (port === "8081" || port === "19006");
}

/** True when client should use the app weather proxy instead of api.open-meteo.com. */
export function useOpenMeteoBrowserProxy(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined";
}

/**
 * Full URL for GET forecast (query string only, no leading `?`).
 */
export function buildOpenMeteoForecastUrl(searchParams: URLSearchParams): string {
  const q = searchParams.toString();
  const upstream = `https://api.open-meteo.com/v1/forecast?${q}`;
  if (!useOpenMeteoBrowserProxy()) return upstream;
  const base = isExpoWebDevBehindProxy() ? "http://localhost:3001" : "";
  return `${base}/api/weather/forecast?${q}`;
}

/**
 * Full URL for geocoding search (query string only).
 */
export function buildOpenMeteoGeocodingUrl(searchParams: URLSearchParams): string {
  const q = searchParams.toString();
  const upstream = `https://geocoding-api.open-meteo.com/v1/search?${q}`;
  if (!useOpenMeteoBrowserProxy()) return upstream;
  const base = isExpoWebDevBehindProxy() ? "http://localhost:3001" : "";
  return `${base}/api/weather/geocoding?${q}`;
}
