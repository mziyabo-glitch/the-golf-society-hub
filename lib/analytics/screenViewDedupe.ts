/**
 * Short-lived in-memory dedupe for screen_view events (React Strict Mode double mount).
 * Key shape: userId + screen + route + focused session — no PII.
 */

const SUPPRESSION_MS = 2_000;

let focusedSessionId = `${Date.now()}`;

const lastEmittedAt = new Map<string, number>();

export function getScreenViewFocusedSessionId(): string {
  return focusedSessionId;
}

/** Test hook: simulate a new app session (full refresh / new tab). */
export function resetScreenViewFocusedSession(): void {
  focusedSessionId = `${Date.now()}`;
  lastEmittedAt.clear();
}

export function buildScreenViewDedupeKey(input: {
  userId: string | null | undefined;
  screen: string;
  route?: string;
  sessionId?: string;
}): string {
  const uid = input.userId?.trim() || "anon";
  const route = input.route ?? "";
  const session = input.sessionId ?? focusedSessionId;
  return `${uid}::${input.screen}::${route}::${session}`;
}

/** Returns true when a new screen_view should be emitted. */
export function shouldEmitScreenView(dedupeKey: string, nowMs: number = Date.now()): boolean {
  const prev = lastEmittedAt.get(dedupeKey);
  if (prev != null && nowMs - prev < SUPPRESSION_MS) {
    return false;
  }
  lastEmittedAt.set(dedupeKey, nowMs);

  if (lastEmittedAt.size > 500) {
    for (const [key, at] of lastEmittedAt) {
      if (nowMs - at > SUPPRESSION_MS * 4) lastEmittedAt.delete(key);
    }
  }

  return true;
}

export const SCREEN_VIEW_SUPPRESSION_MS = SUPPRESSION_MS;
