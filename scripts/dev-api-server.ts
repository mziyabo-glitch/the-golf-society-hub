/**
 * Local dev server for Golf + weather proxy routes and calendar .ics feed.
 * Run alongside `expo start --web` so /api/* works from the browser.
 *
 * Usage: npm run dev:api
 * Set GOLF_API_KEY, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_SUPABASE_URL in .env
 */
import "dotenv/config";
import http from "node:http";
import { getCalendarIcsForToken } from "../lib/calendarIcsFeed";

const PORT = 3001;
const apiKey = process.env.GOLF_API_KEY ?? process.env.NEXT_PUBLIC_GOLF_API_KEY;

const routes: Record<string, (url: URL, pathname?: string) => Promise<{ status: number; body: unknown }>> = {
  "GET /api/golf/search": async (url) => {
    const q = url.searchParams.get("q");
    if (!q) return { status: 400, body: { error: "Missing query parameter" } };
    if (!apiKey) return { status: 500, body: { error: "Golf API key missing in environment variables" } };

    const res = await fetch(
      `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(q)}`,
      {
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );
    const data = await res.json();
    if (res.status === 401) return { status: 401, body: { error: "Golf API authentication failed" } };
    return { status: res.status, body: data };
  },
  "GET /api/golf/course": async (_url, pathname) => {
    const id = pathname?.split("/").pop();
    if (!id) return { status: 400, body: { error: "Missing course id" } };
    if (!apiKey) return { status: 500, body: { error: "Golf API key missing in environment variables" } };

    const res = await fetch(`https://api.golfcourseapi.com/v1/courses/${id}`, {
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text?.slice(0, 500) };
    }
    if (res.status === 401) return { status: 401, body: { error: "Golf API authentication failed" } };
    if (!res.ok)
      return {
        status: res.status,
        body: { error: (data as { error?: string })?.error || text || `Golf API error (${res.status})` },
      };
    return { status: 200, body: data };
  },

  "GET /api/weather/forecast": async (url) => {
    const ALLOWED = new Set([
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
    const out = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (ALLOWED.has(k)) out.append(k, v);
    }
    if (!out.get("latitude") || !out.get("longitude")) {
      return { status: 400, body: { error: "Missing latitude or longitude" } };
    }
    const upstream = `https://api.open-meteo.com/v1/forecast?${out.toString()}`;
    const res = await fetch(upstream);
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: true, reason: text?.slice(0, 200) || "Invalid JSON from Open-Meteo" };
    }
    return { status: res.status, body: data };
  },

  "GET /api/weather/geocoding": async (url) => {
    const ALLOWED = new Set(["name", "count", "language", "format"]);
    const out = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (ALLOWED.has(k)) out.append(k, v);
    }
    if (!out.get("name")?.trim()) {
      return { status: 400, body: { error: "Missing name" } };
    }
    const upstream = `https://geocoding-api.open-meteo.com/v1/search?${out.toString()}`;
    const res = await fetch(upstream);
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: true, reason: text?.slice(0, 200) || "Invalid JSON from Open-Meteo geocoding" };
    }
    return { status: res.status, body: data };
  },
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/calendar/") && pathname.endsWith(".ics")) {
    if (req.method !== "GET") {
      res.writeHead(405, { ...corsHeaders, Allow: "GET, OPTIONS" });
      res.end();
      return;
    }
    const last = pathname.split("/").pop() ?? "";
    try {
      const result = await getCalendarIcsForToken(last);
      res.writeHead(result.status, { ...corsHeaders, ...result.headers });
      res.end(result.body);
    } catch (err) {
      console.error("[dev-api-server] Calendar error:", err);
      res.writeHead(500, { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" });
      res.end("Calendar feed failed");
    }
    return;
  }

  let handler: ((url: URL, pathname?: string) => Promise<{ status: number; body: unknown }>) | undefined;
  if (pathname === "/api/weather/forecast") {
    handler = routes["GET /api/weather/forecast"];
  } else if (pathname === "/api/weather/geocoding") {
    handler = routes["GET /api/weather/geocoding"];
  } else if (pathname.startsWith("/api/golf/course/")) {
    handler = routes["GET /api/golf/course"];
  } else {
    handler = routes[`${req.method} ${pathname}`];
  }

  if (!handler) {
    res.writeHead(404, { ...corsHeaders, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const result = pathname.startsWith("/api/golf/course/")
      ? await handler(url, pathname)
      : await handler(url);
    res.writeHead(result.status, { ...corsHeaders, "Content-Type": "application/json" });
    res.end(JSON.stringify(result.body));
  } catch (err) {
    console.error("[dev-api-server] Error:", err);
    res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to fetch" }));
  }
});

server.listen(PORT, () => {
  console.log(
    `[dev-api-server] http://localhost:${PORT} (golf, /api/weather/*, /api/calendar/*.ics)`,
  );
  if (!apiKey) console.warn("[dev-api-server] GOLF_API_KEY not set - golf calls will fail");
});
