/**
 * Open-Meteo geocoding (no API key). Used when DB/API lack coordinates.
 * On web, requests go through /api/weather/geocoding to avoid CORS.
 */

import { buildOpenMeteoGeocodingUrl } from "./openMeteoWebProxy";

export async function geocodePlaceName(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = query.trim();
  if (q.length < 2) return null;

  const params = new URLSearchParams({
    name: q,
    count: "3",
    language: "en",
    format: "json",
  });
  const url = buildOpenMeteoGeocodingUrl(params);

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const results = json?.results;
    if (!Array.isArray(results) || results.length === 0) return null;
    const r = results[0];
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ") || q;
    return { lat, lng, label };
  } catch {
    return null;
  }
}
