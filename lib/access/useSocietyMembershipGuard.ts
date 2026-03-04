// lib/access/useSocietyMembershipGuard.ts
// Centralised guard hook: ensures the current user has an active society
// AND an actual membership row. If not, clears the stale pointer and
// lets the UI fall back to personal mode / onboarding.
//
// IMPORTANT: This guard must be tolerant of transient null-member windows
// that occur during post-join bootstrap refresh. It uses a generous grace
// period and multiple retries before clearing profile pointers.

import { useEffect, useRef } from "react";
import { usePathname } from "expo-router";
import { useBootstrap } from "@/lib/useBootstrap";

const RETRY_BACKOFF_MS = [300, 800, 1600, 2500, 3500] as const;
const CLEAR_AFTER_MS = 10_000;

export type GuardResult = {
  /** Still loading bootstrap data — show a spinner. */
  loading: boolean;
  /** User has an active society AND a valid membership row. */
  isMember: boolean;
  /** Guard is actively redirecting — avoid rendering screen content. */
  redirecting: boolean;
};

/**
 * Checks that:
 *  1) bootstrap is finished loading
 *  2) the user has an active society
 *  3) the user has a matching member row for that society
 *
 * If (2) or (3) fail after a generous grace period the profile pointer is
 * cleared and the UI naturally enters Personal Mode. The grace period
 * prevents premature clearing during post-join bootstrap resolution.
 */
function isGuardExemptRoute(pathname: string | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith("/(share)") ||
    pathname.startsWith("/tee-sheet") ||
    pathname.startsWith("/(app)/tee-sheet")
  );
}

export function useSocietyMembershipGuard(): GuardResult {
  const {
    loading,
    membershipLoading,
    activeSocietyId,
    member,
    setActiveSociety,
    refresh,
  } = useBootstrap();
  const pathname = usePathname();

  const redirected = useRef(false);
  const trackedSocietyId = useRef<string | null>(null);
  const missingSinceMs = useRef<number | null>(null);
  const retryCount = useRef(0);

  const hasSociety = !!activeSocietyId;
  const hasMember = !!member;
  const isMember = hasSociety && hasMember;
  const onToolRoute = isGuardExemptRoute(pathname);

  useEffect(() => {
    if (onToolRoute) return;

    // Reset tracking when the active society changes.
    if (activeSocietyId !== trackedSocietyId.current) {
      trackedSocietyId.current = activeSocietyId ?? null;
      missingSinceMs.current = null;
      retryCount.current = 0;
      redirected.current = false;
    }

    // While bootstrap/membership is in-flight, don't act.
    if (loading || membershipLoading) return;
    if (redirected.current) return;

    // No society → Personal Mode, nothing to guard.
    if (!hasSociety) {
      missingSinceMs.current = null;
      retryCount.current = 0;
      redirected.current = false;
      return;
    }

    // Society + member are both present → healthy state.
    if (hasMember) {
      missingSinceMs.current = null;
      retryCount.current = 0;
      redirected.current = false;
      return;
    }

    // --- hasSociety && !hasMember ---
    // Member is missing. This can happen transiently after a join while
    // bootstrap re-reads from DB. Use retries + a generous grace window
    // before concluding the pointer is truly stale.

    if (missingSinceMs.current === null) {
      missingSinceMs.current = Date.now();
      console.log("[MembershipGuard] member missing — starting grace window", {
        activeSocietyId,
      });
    }

    // Retry with backoff.
    if (retryCount.current < RETRY_BACKOFF_MS.length) {
      const delayMs = RETRY_BACKOFF_MS[retryCount.current];
      const attempt = retryCount.current + 1;
      retryCount.current += 1;
      const timer = setTimeout(() => {
        console.log("[MembershipGuard] retry refresh", { attempt, delayMs, activeSocietyId });
        refresh();
      }, delayMs);
      return () => clearTimeout(timer);
    }

    // After retries, wait for the full grace period.
    const elapsedMs = Date.now() - missingSinceMs.current;
    if (elapsedMs < CLEAR_AFTER_MS) {
      const remainingMs = CLEAR_AFTER_MS - elapsedMs;
      const timer = setTimeout(() => {
        console.log("[MembershipGuard] grace-window refresh", { elapsedMs, remainingMs, activeSocietyId });
        refresh();
      }, remainingMs);
      return () => clearTimeout(timer);
    }

    // Grace period exhausted — the profile points to a society the user
    // is no longer a member of. Clear the stale pointer.
    console.warn(
      "[MembershipGuard] clearing stale pointer after grace period",
      { activeSocietyId, elapsedMs }
    );
    redirected.current = true;
    setActiveSociety(null, null)
      .catch((e) => console.error("[MembershipGuard] clear error:", e));
  }, [loading, membershipLoading, hasSociety, hasMember, setActiveSociety, activeSocietyId, refresh, onToolRoute]);

  return {
    loading: loading || membershipLoading,
    isMember,
    redirecting: redirected.current && !isMember,
  };
}
