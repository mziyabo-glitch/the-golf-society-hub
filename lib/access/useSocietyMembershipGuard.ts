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
  console.log("ROUTE_GUARD_TOP");
  const {
    loading,
    membershipLoading,
    activeSocietyId,
    member,
    memberships,
    setActiveSociety,
    refresh,
  } = useBootstrap();
  console.log("ROUTE_GUARD_AFTER_HOOK_1");
  const pathname = usePathname();
  console.log("ROUTE_GUARD_AFTER_HOOK_2");

  const redirected = useRef(false);
  const trackedSocietyId = useRef<string | null>(null);
  const missingSinceMs = useRef<number | null>(null);
  const retryCount = useRef(0);

  const hasSociety = !!activeSocietyId;
  const hasMember = !!member;
  const isMember = hasSociety && hasMember;
  const onToolRoute = isGuardExemptRoute(pathname);
  // If we have a memberships list and the active society is in it,
  // treat it as structurally valid even while the member row loads.
  const inMembershipsList =
    hasSociety && memberships.length > 0 && memberships.some((m) => m.societyId === activeSocietyId);

  useEffect(() => {
    if (onToolRoute) return;

    if (activeSocietyId !== trackedSocietyId.current) {
      trackedSocietyId.current = activeSocietyId ?? null;
      missingSinceMs.current = null;
      retryCount.current = 0;
      redirected.current = false;
    }

    if (loading || membershipLoading) return;
    if (redirected.current) return;

    if (!hasSociety) {
      missingSinceMs.current = null;
      retryCount.current = 0;
      return;
    }

    if (hasMember) {
      missingSinceMs.current = null;
      retryCount.current = 0;
      redirected.current = false;
      return;
    }

    // If the society is confirmed in the memberships list, the member
    // row will resolve shortly — keep waiting without starting the
    // clear timer.
    if (inMembershipsList) {
      if (retryCount.current < RETRY_BACKOFF_MS.length) {
        const delayMs = RETRY_BACKOFF_MS[retryCount.current];
        retryCount.current += 1;
        const timer = setTimeout(() => refresh(), delayMs);
        return () => clearTimeout(timer);
      }
      return;
    }

    // --- hasSociety && !hasMember && NOT in memberships list ---
    if (missingSinceMs.current === null) {
      missingSinceMs.current = Date.now();
    }

    if (retryCount.current < RETRY_BACKOFF_MS.length) {
      const delayMs = RETRY_BACKOFF_MS[retryCount.current];
      retryCount.current += 1;
      const timer = setTimeout(() => refresh(), delayMs);
      return () => clearTimeout(timer);
    }

    const elapsedMs = Date.now() - missingSinceMs.current;
    if (elapsedMs < CLEAR_AFTER_MS) {
      const remainingMs = CLEAR_AFTER_MS - elapsedMs;
      const timer = setTimeout(() => refresh(), remainingMs);
      return () => clearTimeout(timer);
    }

    console.warn("[MembershipGuard] clearing stale pointer", { activeSocietyId, elapsedMs });
    redirected.current = true;
    setActiveSociety(null, null)
      .catch((e) => console.error("[MembershipGuard] clear error:", e));
  }, [loading, membershipLoading, hasSociety, hasMember, inMembershipsList, setActiveSociety, activeSocietyId, refresh, onToolRoute]);

  console.log("ROUTE_GUARD_BEFORE_RETURN");

  // DIAGNOSIS: Bypass guard entirely for /event/.../players to isolate #310
  const path = typeof pathname === "string" ? pathname : "";
  const isPlayersRoute = path.includes("/event/") && path.endsWith("/players");
  if (isPlayersRoute) {
    return { loading: false, isMember: true, redirecting: false };
  }

  return {
    loading: loading || membershipLoading,
    isMember,
    redirecting: redirected.current && !isMember,
  };
}
