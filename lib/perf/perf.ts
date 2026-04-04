/**
 * Lightweight performance helpers (__DEV__ logging only).
 * Use for API latency and coarse commit timing on critical flows.
 */

import { useLayoutEffect } from "react";

function nowMs(): number {
  if (typeof globalThis !== "undefined" && typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }
  return Date.now();
}

/** Time an async operation; logs [perf][api] in __DEV__. */
export async function measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = nowMs();
  try {
    const result = await fn();
    if (__DEV__) {
      const ms = nowMs() - start;
      console.log(`[perf][api] ${label} ${ms.toFixed(0)}ms`);
    }
    return result;
  } catch (e) {
    if (__DEV__) {
      const ms = nowMs() - start;
      console.log(`[perf][api] ${label} failed after ${ms.toFixed(0)}ms`);
    }
    throw e;
  }
}

/**
 * Logs time from render start to useLayoutEffect (sync after DOM updates).
 * High values often mean expensive child work; use React Profiler for detail.
 */
export function useSlowCommitLog(componentLabel: string, thresholdMs = 64): void {
  const renderAt = nowMs();
  useLayoutEffect(() => {
    if (!__DEV__) return;
    const ms = nowMs() - renderAt;
    if (ms >= thresholdMs) {
      console.log(`[perf][commit] ${componentLabel} ${ms.toFixed(1)}ms`);
    }
  });
}
