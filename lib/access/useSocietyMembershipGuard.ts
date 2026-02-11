// lib/access/useSocietyMembershipGuard.ts
// Centralised guard hook: ensures the current user has an active society
// AND an actual membership row. If not, clears the stale pointer and
// redirects to onboarding so the user can join/create a society.

import { useEffect, useRef } from "react";
import { useRouter, useSegments } from "expo-router";
import { useBootstrap } from "@/lib/useBootstrap";

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
    activeSocietyId,
    member,
    setActiveSociety,
  } = useBootstrap();

  const router = useRouter();
  const segments = useSegments();
  const redirected = useRef(false);

  // Determine actual membership
  const hasSociety = !!activeSocietyId;
  const hasMember = !!member;
  const isMember = hasSociety && hasMember;

  useEffect(() => {
    if (loading) {
      redirected.current = false;
      return;
    }
    if (redirected.current) return;

    // No society → Personal Mode, no redirect needed.
    if (!hasSociety) return;

    if (hasSociety && !hasMember) {
      // The user's profile points to a society they are no longer a member of.
      // Clear the stale pointer — the UI will naturally enter Personal Mode.
      console.warn(
        "[MembershipGuard] activeSocietyId is set but member is null — clearing stale pointer"
      );
      redirected.current = true;
      setActiveSociety(null, null)
        .catch((e) => console.error("[MembershipGuard] clear error:", e));
    }
  }, [loading, hasSociety, hasMember, setActiveSociety]);

  return {
    loading,
    isMember,
    redirecting: redirected.current && !isMember,
  };
}
