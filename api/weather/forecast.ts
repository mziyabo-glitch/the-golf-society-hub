/**
 * Server-side proxy: Open-Meteo forecast (avoids browser CORS / bad-gateway pages without CORS).
 */

const ALLOWED_KEYS = new Set([
  "latitude",
  "longitude",
  "hourly",
  "daily",
  "forecast_days",
  "timezone",
  "wind_speed_unit",
  "temperature_unit",
  "precipitation_unit",
  "start_date",
  "end_date",
]);

export async function GET(req: Request) {
  try {
    const inUrl = new URL(req.url);
    const out = new URLSearchParams();
    for (const [k, v] of inUrl.searchParams) {
      if (ALLOWED_KEYS.has(k)) out.append(k, v);
    }
    const lat = out.get("latitude");
    const lon = out.get("longitude");
    if (!lat || !lon) {
      return Response.json({ error: "Missing latitude or longitude" }, { status: 400 });
    }

    const upstream = `https://api.open-meteo.com/v1/forecast?${out.toString()}`;
    const res = await fetch(upstream, { headers: { Accept: "application/json" } });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    console.error("[api/weather/forecast]", e);
    return Response.json({ error: "Forecast proxy failed" }, { status: 502 });
  }
}
