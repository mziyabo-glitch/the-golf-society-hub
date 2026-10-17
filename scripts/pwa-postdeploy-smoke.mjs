/**
 * Post-deploy smoke checks for PWA installability endpoints.
 *
 * Usage:
 *   node scripts/pwa-postdeploy-smoke.mjs --base-url https://your-app.vercel.app
 *
 * Or via env:
 *   PWA_SMOKE_BASE_URL=https://your-app.vercel.app node scripts/pwa-postdeploy-smoke.mjs
 *
 * Checks:
 * - GET /manifest.json returns JSON with required fields
 * - manifest icon URLs resolve with 200
 * - GET /sw.js returns JavaScript content
 */

const requiredManifestFields = [
  "name",
  "short_name",
  "display",
  "start_url",
  "scope",
  "background_color",
  "theme_color",
  "icons",
];

function parseBaseUrl() {
  const argIndex = process.argv.findIndex((a) => a === "--base-url");
  const fromArg = argIndex >= 0 ? process.argv[argIndex + 1] : null;
  const raw = (fromArg || process.env.PWA_SMOKE_BASE_URL || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(`[pwa-smoke] FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`[pwa-smoke] OK: ${message}`);
}

async function fetchStrict(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) fail(`${url} returned HTTP ${res.status}`);
  return res;
}

async function main() {
  const baseUrl = parseBaseUrl();
  if (!baseUrl) {
    console.log(
      "[pwa-smoke] SKIP: Provide --base-url https://... or set PWA_SMOKE_BASE_URL to run post-deploy checks.",
    );
    process.exit(0);
  }

  console.log(`[pwa-smoke] Base URL: ${baseUrl}`);

  const manifestUrl = `${baseUrl}/manifest.json`;
  const manifestRes = await fetchStrict(manifestUrl);
  const manifestCt = (manifestRes.headers.get("content-type") || "").toLowerCase();
  if (!manifestCt.includes("application/json") && !manifestCt.includes("manifest+json")) {
    fail(`/manifest.json content-type is not JSON (got "${manifestCt || "unknown"}")`);
  }
  const manifest = await manifestRes.json();
  pass("/manifest.json returned JSON");

  for (const key of requiredManifestFields) {
    if (!(key in manifest)) fail(`manifest missing required field "${key}"`);
  }
  if (manifest.name !== "The Golf Society Hub") fail(`manifest.name mismatch: "${manifest.name}"`);
  if (manifest.short_name !== "GSH") fail(`manifest.short_name mismatch: "${manifest.short_name}"`);
  if (manifest.display !== "standalone") fail(`manifest.display mismatch: "${manifest.display}"`);
  if (manifest.start_url !== "/") fail(`manifest.start_url mismatch: "${manifest.start_url}"`);
  if (manifest.scope !== "/") fail(`manifest.scope mismatch: "${manifest.scope}"`);
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) fail("manifest.icons is empty");
  const sizes = new Set(manifest.icons.map((i) => String(i?.sizes || "")));
  if (!sizes.has("192x192")) fail("manifest missing 192x192 icon");
  if (!sizes.has("512x512")) fail("manifest missing 512x512 icon");
  pass("manifest required fields and icon sizes verified");

  for (const icon of manifest.icons) {
    const src = String(icon?.src || "").trim();
    if (!src) fail("manifest icon entry missing src");
    const iconUrl = new URL(src, `${baseUrl}/`).toString();
    const iconRes = await fetchStrict(iconUrl);
    const iconCt = (iconRes.headers.get("content-type") || "").toLowerCase();
    if (!iconCt.includes("image/")) fail(`icon ${iconUrl} is not an image (content-type: ${iconCt || "unknown"})`);
    pass(`icon reachable: ${iconUrl}`);
  }

  const swUrl = `${baseUrl}/sw.js`;
  const swRes = await fetchStrict(swUrl);
  const swCt = (swRes.headers.get("content-type") || "").toLowerCase();
  if (!swCt.includes("javascript") && !swCt.includes("text/plain")) {
    fail(`/sw.js content-type unexpected: "${swCt || "unknown"}"`);
  }
  const swBody = await swRes.text();
  if (!swBody.includes("self.addEventListener")) fail("/sw.js does not look like a service worker script");
  pass("/sw.js reachable and looks valid");

  console.log("[pwa-smoke] DONE");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));

