// lib/navigation.ts
// Safe navigation helpers for mobile Safari and deep-link resilience.
// On iPhone Safari, window.history can be empty when a page is opened
// via deep link, share sheet, or home screen bookmark. router.back()
// fails silently in that case. goBack() always has a working escape.

import { Platform } from "react-native";
import type { Router } from "expo-router";

/**
 * Navigate back safely. Falls back to a known route when there is
 * no browser history (deep link, refresh, bookmark on mobile Safari).
 */
export function goBack(router: Router, fallback: string = "/(app)/(tabs)") {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.history.length <= 1) {
    router.replace(fallback as any);
  } else {
    router.back();
  }
}
