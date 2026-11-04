/**
 * Local dev server for Golf + weather proxy routes and calendar .ics feed.
 * Run alongside `expo start --web` so /api/* works from the browser.
 *
 * Usage: npm run dev:api
 * Set GOLF_API_KEY, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_SUPABASE_URL in .env
 */
import "dotenv/config";
import http from "node:http";
import { Client } from "pg";
import { getCalendarIcsForToken } from "../lib/calendarIcsFeed";
import { isPaymentStaging, paymentStagingEnvError } from "../lib/payments/stagingGuard";

const stagingProblem = paymentStagingEnvError();
if (stagingProblem) {
  console.error(`[dev-api-server] ${stagingProblem}`);
  process.exit(1);
}

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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key, Stripe-Signature",
};

async function stagingDatabaseStatus(): Promise<{
  ok: boolean;
  database: "reachable" | "unreachable" | "not_configured";
  via: "postgres" | "supabase" | null;
  stripeCheckoutCreated: false;
}> {
  const connectionString = process.env.STAGING_DATABASE_URL?.trim();
  if (connectionString) {
    if (connectionString.toLowerCase().includes("eaenzjwecrrbhibrvgsb")) {
      return { ok: false, database: "unreachable", via: null, stripeCheckoutCreated: false };
    }
    const client = new Client({ connectionString });
    try {
      await client.connect();
      const result = await client.query("select 1 as ok");
      const reachable = result.rows[0]?.ok === 1;
      return {
        ok: reachable,
        database: reachable ? "reachable" : "unreachable",
        via: "postgres",
        stripeCheckoutCreated: false,
      };
    } catch {
      console.error("[dev-api-server] staging database check failed");
      return { ok: false, database: "unreachable", via: "postgres", stripeCheckoutCreated: false };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  const hasSupabase =
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) &&
    Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim());
  if (!hasSupabase) {
    return { ok: false, database: "not_configured", via: null, stripeCheckoutCreated: false };
  }
  try {
    const { getServiceRoleSupabase } = await import("../lib/server/supabaseServiceRole");
    const supabase = getServiceRoleSupabase();
    const { error } = await supabase.from("societies").select("id").limit(1);
    if (error) {
      console.error("[dev-api-server] staging supabase check failed");
      return { ok: false, database: "unreachable", via: "supabase", stripeCheckoutCreated: false };
    }
    return { ok: true, database: "reachable", via: "supabase", stripeCheckoutCreated: false };
  } catch {
    console.error("[dev-api-server] staging supabase check failed");
    return { ok: false, database: "unreachable", via: "supabase", stripeCheckoutCreated: false };
  }
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

async function readRawBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname === "/api/health/db" && req.method === "GET") {
    if (!isPaymentStaging()) {
      res.writeHead(404, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    const status = await stagingDatabaseStatus();
    res.writeHead(status.ok ? 200 : 503, { ...corsHeaders, "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
    return;
  }

  if (pathname === "/api/stripe/staging-platform-charge" && req.method === "GET") {
    const { stagingPlatformChargePermitted } = await import("../lib/payments/stagingPlatformCharge");
    res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
    res.end(JSON.stringify({ enabled: stagingPlatformChargePermitted(process.env) }));
    return;
  }

  if (pathname === "/api/stripe/guest-checkout" && req.method === "POST") {
    try {
      const { handleCreateGuestCheckoutSession } = await import("../lib/payments/guestCheckout");
      const rawBody = await readJsonBody(req);
      const result = await handleCreateGuestCheckoutSession({
        idempotencyKey: Array.isArray(req.headers["idempotency-key"])
          ? req.headers["idempotency-key"][0]
          : req.headers["idempotency-key"],
        rawBody,
      });
      res.writeHead(result.status, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      console.error("[dev-api-server] Stripe guest checkout error:", err);
      res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Checkout failed" }));
    }
    return;
  }

  if (pathname === "/api/stripe/create-checkout-session" && req.method === "POST") {
    try {
      const { handleCreateEventCheckoutSession } = await import(
        "../lib/payments/createCheckoutSessionHandler"
      );
      const rawBody = await readJsonBody(req);
      const result = await handleCreateEventCheckoutSession({
        authorizationHeader: req.headers.authorization,
        idempotencyKey: Array.isArray(req.headers["idempotency-key"])
          ? req.headers["idempotency-key"][0]
          : req.headers["idempotency-key"],
        rawBody,
      });
      res.writeHead(result.status, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      console.error("[dev-api-server] Stripe checkout error:", err);
      res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Checkout failed" }));
    }
    return;
  }

  if (pathname === "/api/stripe/connect-onboarding" && req.method === "POST") {
    try {
      const { handleConnectOnboarding } = await import("../lib/payments/connectOnboarding");
      const rawBody = await readJsonBody(req);
      const result = await handleConnectOnboarding({
        authorizationHeader: req.headers.authorization,
        rawBody,
      });
      res.writeHead(result.status, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      console.error("[dev-api-server] Stripe Connect error:", err);
      res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Connect onboarding failed" }));
    }
    return;
  }

  if (pathname === "/api/stripe/refund" && req.method === "POST") {
    try {
      const { handleRefundEventPayment } = await import("../lib/payments/refundEventPayment");
      const rawBody = await readJsonBody(req);
      const result = await handleRefundEventPayment({
        authorizationHeader: req.headers.authorization,
        idempotencyKey: Array.isArray(req.headers["idempotency-key"])
          ? req.headers["idempotency-key"][0]
          : req.headers["idempotency-key"],
        rawBody,
      });
      res.writeHead(result.status, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      console.error("[dev-api-server] Stripe refund error:", err);
      res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Refund failed" }));
    }
    return;
  }

  if (pathname === "/api/stripe/webhook" && req.method === "POST") {
    try {
      const { handleStripeWebhook } = await import("../lib/payments/stripeWebhookHandler");
      const rawBody = await readRawBody(req);
      const sig = Array.isArray(req.headers["stripe-signature"])
        ? req.headers["stripe-signature"][0]
        : req.headers["stripe-signature"];
      const result = await handleStripeWebhook({ rawBody, signatureHeader: sig });
      res.writeHead(result.status, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      console.error("[dev-api-server] Stripe webhook error:", err);
      res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Webhook failed" }));
    }
    return;
  }

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
