/** Prod-safe instrumentation + helpers for ManCo tee-sheet event detail loads. */

export const TEE_SHEET_LOAD_LOG_PREFIX = "[tee-sheet-load]" as const;

export const TEE_SHEET_LOAD_TIMEOUT_MS = 13_000;

export const TEE_SHEET_LOAD_TIMEOUT_MESSAGE = "Could not load tee sheet. Try again.";

export type TeeSheetLoadLogPayload = Record<string, unknown>;

export function teeSheetLoadStartedAt(): number {
  return Date.now();
}

export function teeSheetLoadElapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

/** console.warn — visible in production for load diagnostics. */
export function teeSheetLoadLog(step: string, payload?: TeeSheetLoadLogPayload): void {
  console.warn(TEE_SHEET_LOAD_LOG_PREFIX, step, payload ?? {});
}

export function isStaleTeeSheetLoad(seq: number, currentSeq: number): boolean {
  return seq !== currentSeq;
}

export function shouldClearTeeSheetRefreshing(): boolean {
  return true;
}

export function withTeeSheetLoadTimeout<T>(
  promise: Promise<T>,
  ms: number = TEE_SHEET_LOAD_TIMEOUT_MS,
  message: string = TEE_SHEET_LOAD_TIMEOUT_MESSAGE,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Reject malformed canonical tee_groups payloads instead of spinning the editor. */
export function validateCanonicalTeeGroupsForEditor(
  canonical: { source: string; groups: { groupNumber: number; players: { id: string }[] }[] } | null,
): string | null {
  if (!canonical) return null;
  if (canonical.source !== "tee_groups") return null;
  if (!Array.isArray(canonical.groups)) {
    return "Invalid tee sheet data (groups missing).";
  }
  for (const g of canonical.groups) {
    if (!Number.isFinite(g.groupNumber)) {
      return "Invalid tee sheet data (group number).";
    }
    if (!Array.isArray(g.players)) {
      return "Invalid tee sheet data (players missing).";
    }
    for (const p of g.players) {
      if (!p?.id || typeof p.id !== "string") {
        return "Invalid tee sheet data (player id).";
      }
    }
  }
  return null;
}
