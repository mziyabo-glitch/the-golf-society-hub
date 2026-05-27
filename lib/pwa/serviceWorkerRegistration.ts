import { isWebRuntime } from "@/lib/pwa/runtime";

const SW_RECOVERY_KEY = "gsh:sw-recovery:v-next";
const SAFE_CACHE_MARKER = "gsh-v-next";

/** Legacy handler that rejects the fetch event when the network fails. */
function isBrokenServiceWorkerScript(source: string): boolean {
  return /event\.respondWith\s*\(\s*fetch\s*\(\s*event\.request\s*\)\s*\)/.test(source);
}

/**
 * One-time recovery for clients stuck on the broken network-only SW handler.
 * Returns true when a reload was triggered (caller should stop bootstrapping).
 */
export async function recoverFromBrokenServiceWorker(): Promise<boolean> {
  if (!isWebRuntime() || !("serviceWorker" in navigator)) return false;

  try {
    if (sessionStorage.getItem(SW_RECOVERY_KEY) === "done") return false;

    const swResponse = await fetch("/sw.js", { cache: "no-store" });
    const swText = await swResponse.text();
    if (!swText.includes(SAFE_CACHE_MARKER) || isBrokenServiceWorkerScript(swText)) {
      return false;
    }

    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return false;

    const recoveryPhase = sessionStorage.getItem(SW_RECOVERY_KEY);
    if (recoveryPhase === "reloading") {
      sessionStorage.setItem(SW_RECOVERY_KEY, "done");
      return false;
    }

    const active = registration.active ?? navigator.serviceWorker.controller;
    if (!active) return false;

    sessionStorage.setItem(SW_RECOVERY_KEY, "reloading");
    await registration.unregister();
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export async function registerAppServiceWorker(): Promise<void> {
  if (!isWebRuntime() || !("serviceWorker" in navigator)) return;

  const reloaded = await recoverFromBrokenServiceWorker();
  if (reloaded) return;

  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    if (__DEV__) console.warn("[pwa] service worker registration failed", e);
  }
}
