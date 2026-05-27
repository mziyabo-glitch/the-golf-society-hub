/* PWA service worker — safe fetch handling, versioned shell cache. */
const CACHE_NAME = "gsh-v-next";

const NETWORK_ONLY_URL = /supabase\.co/i;
const NETWORK_ONLY_PATH = /\/api\//i;

function isNetworkOnlyRequest(request) {
  const url = request.url;
  if (NETWORK_ONLY_URL.test(url) || NETWORK_ONLY_PATH.test(url)) return true;
  const accept = request.headers.get("accept") || "";
  if (accept.includes("application/json") && !accept.includes("text/html")) return true;
  return false;
}

function isNavigationRequest(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return request.method === "GET" && accept.includes("text/html");
}

async function openAppCache() {
  return caches.open(CACHE_NAME);
}

async function cachedIndexHtml() {
  const cache = await openAppCache();
  return cache.match("/index.html");
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await openAppCache();
      void cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    const cached = await cachedIndexHtml();
    if (cached) return cached;
    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({ error: "network_error" }), {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function networkFirstWithCacheFallback(request) {
  try {
    return await fetch(request);
  } catch {
    try {
      const cached = await caches.match(request);
      if (cached) return cached;
    } catch {
      // Ignore cache read errors.
    }
    return new Response("", {
      status: 503,
      statusText: "Service Unavailable",
    });
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    openAppCache()
      .then((cache) => cache.add("/index.html"))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (isNetworkOnlyRequest(request)) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(networkFirstWithCacheFallback(request));
});
