/**
 * Web-only browser / capability hints for Safari, in-app browsers, and gated APIs.
 */

import { Platform } from "react-native";

export type InAppBrowserInfo = {
  inApp: boolean;
  /** Short label for UI, e.g. "Instagram" */
  label: string | null;
};

/**
 * Detect embedded / in-app WebViews that often block Web Share, storage, or OAuth.
 */
export function getInAppBrowserInfo(): InAppBrowserInfo {
  if (Platform.OS !== "web" || typeof navigator === "undefined") {
    return { inApp: false, label: null };
  }

  const ua = navigator.userAgent || "";

  const rules: { test: RegExp; label: string }[] = [
    { test: /FBAN|FBAV|FB_IAB|FBIOS/i, label: "Facebook" },
    { test: /Instagram/i, label: "Instagram" },
    { test: /Line\//i, label: "LINE" },
    { test: /LinkedInApp/i, label: "LinkedIn" },
    { test: /Snapchat/i, label: "Snapchat" },
    { test: /Twitter/i, label: "Twitter/X" },
    { test: / TikTok/i, label: "TikTok" },
    { test: /; wv\)/i, label: "in-app browser" },
  ];

  for (const { test, label } of rules) {
    if (test.test(ua)) {
      return { inApp: true, label };
    }
  }

  return { inApp: false, label: null };
}

export function isIOSLikeWeb(): boolean {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function isWebShareLikelyBlockedWithoutGesture(): boolean {
  // iOS Safari (and most mobile WebKit) requires transient activation for share(file).
  return Platform.OS === "web" && isIOSLikeWeb();
}

export function isDomNotAllowedError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const o = err as { name?: unknown; message?: unknown };
  if (o.name === "NotAllowedError") return true;
  if (typeof o.message === "string") {
    return o.message.includes("not allowed by the user agent") ||
      o.message.includes("user denied permission");
  }
  return false;
}

/**
 * User-facing explanation when Web Share / clipboard / similar APIs reject the call.
 */
export function webPermissionBlockedMessage(): string {
  return (
    "Your browser blocked sharing from this screen. " +
    "On iPhone, use Safari (not an in-app browser), or tap Download and attach the file manually. " +
    "If you opened the link from another app, use the Share menu and choose “Open in Safari”."
  );
}
