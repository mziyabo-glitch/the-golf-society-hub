/**
 * Server-side proxy: Open-Meteo geocoding (same CORS story as forecast on web).
 */

const ALLOWED_KEYS = new Set(["name", "count", "language", "format"]);

export async function GET(req: Request) {
  try {
    const inUrl = new URL(req.url);
    const out = new URLSearchParams();
    for (const [k, v] of inUrl.searchParams) {
      if (ALLOWED_KEYS.has(k)) out.append(k, v);
    }
    const name = out.get("name")?.trim();
    if (!name) {
      return Response.json({ error: "Missing name" }, { status: 400 });
    }

    const upstream = `https://geocoding-api.open-meteo.com/v1/search?${out.toString()}`;
    const res = await fetch(upstream, { headers: { Accept: "application/json" } });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch (e) {
    console.error("[api/weather/geocoding]", e);
    return Response.json({ error: "Geocoding proxy failed" }, { status: 502 });
  }
}
