// lib/access/useSocietyMembershipGuard.ts
// Centralised guard hook: ensures the current user has an active society
// AND an actual membership row. If not, clears the stale pointer and
// redirects to onboarding so the user can join/create a society.

import { useEffect, useRef } from "react";
import { useBootstrap } from "@/lib/useBootstrap";

const RETRY_BACKOFF_MS = [200, 600, 1400] as const;
const CLEAR_AFTER_MS = 4000;

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
 * If (2) or (3) fail the profile is cleared and the user is sent to
 * `/onboarding`. This covers the edge-case where a user was removed
 * from a society (member row deleted) while their profile still points
 * to `active_society_id`.
 */
export function useSocietyMembershipGuard(): GuardResult {
  const {
    loading,
    membershipLoading,
    activeSocietyId,
    member,
    setActiveSociety,
    refresh,
  } = useBootstrap();

  const redirected = useRef(false);
  const trackedSocietyId = useRef<string | null>(null);
  const missingSinceMs = useRef<number | null>(null);
  const retryCount = useRef(0);

  // Determine actual membership
  const hasSociety = !!activeSocietyId;
  const hasMember = !!member;
  const isMember = hasSociety && hasMember;

  useEffect(() => {
    if (activeSocietyId !== trackedSocietyId.current) {
      trackedSocietyId.current = activeSocietyId ?? null;
      missingSinceMs.current = null;
      retryCount.current = 0;
      redirected.current = false;
    }

    if (loading || membershipLoading) return;
    if (redirected.current) return;

    // No society → Personal Mode, no redirect needed.
    if (!hasSociety) {
      missingSinceMs.current = null;
      retryCount.current = 0;
      redirected.current = false;
      return;
    }

    if (hasMember) {
      missingSinceMs.current = null;
      retryCount.current = 0;
      redirected.current = false;
      return;
    }

    if (hasSociety && !hasMember) {
      if (missingSinceMs.current === null) {
        missingSinceMs.current = Date.now();
      }

      if (retryCount.current < RETRY_BACKOFF_MS.length) {
        const delayMs = RETRY_BACKOFF_MS[retryCount.current];
        retryCount.current += 1;
        const timer = setTimeout(() => {
          refresh();
        }, delayMs);
        return () => clearTimeout(timer);
      }

      const elapsedMs = Date.now() - missingSinceMs.current;
      if (elapsedMs < CLEAR_AFTER_MS) {
        const remainingMs = CLEAR_AFTER_MS - elapsedMs;
        const timer = setTimeout(() => {
          refresh();
        }, remainingMs);
        return () => clearTimeout(timer);
      }

      // The user's profile points to a society they are no longer a member of.
      // Clear the stale pointer — the UI will naturally enter Personal Mode.
      console.warn(
        "[MembershipGuard] activeSocietyId is set but member is still null after retry/grace — clearing stale pointer"
      );
      redirected.current = true;
      setActiveSociety(null, null)
        .catch((e) => console.error("[MembershipGuard] clear error:", e));
    }
  }, [loading, membershipLoading, hasSociety, hasMember, setActiveSociety, activeSocietyId, refresh]);

  return {
    loading: loading || membershipLoading,
    isMember,
    redirecting: redirected.current && !isMember,
  };
}
