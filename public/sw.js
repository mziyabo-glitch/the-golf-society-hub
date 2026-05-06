/* Minimal network-first service worker for installability without aggressive caching. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Keep behavior network-first to avoid stale release/auth issues.
  event.respondWith(fetch(event.request));
});
