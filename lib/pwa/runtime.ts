export function isWebRuntime(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

export function isStandalonePwa(): boolean {
  if (!isWebRuntime()) return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const iosStandalone = nav.standalone === true;
  const mediaStandalone = typeof window.matchMedia === "function"
    ? window.matchMedia("(display-mode: standalone)").matches
    : false;
  return iosStandalone || mediaStandalone;
}

export function getPwaPlatform(): "android" | "ios" | "desktop" | "unknown" {
  if (!isWebRuntime()) return "unknown";
  const ua = navigator.userAgent || "";
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  if (isIos) return "ios";
  if (isAndroid) return "android";
  if (/Macintosh|Windows|Linux|CrOS/i.test(ua)) return "desktop";
  return "unknown";
}
