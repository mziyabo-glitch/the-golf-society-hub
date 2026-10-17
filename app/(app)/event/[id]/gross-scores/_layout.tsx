/**
 * Live gross scoring routes — DEPRECATED pending adoption.
 * Accessible only when the event has live_gross_scoring_enabled.
 * Keep routes and tables; redirect inactive deep links to the event overview.
 */

import { useEffect, useRef, useState } from "react";
import { Slot, useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getPermissionsForMember, isCaptain, isSecretary } from "@/lib/rbac";
import { getEvent } from "@/lib/db_supabase/eventRepo";
import { isLiveGrossScoringEnabledForEvent } from "@/lib/featureVisibility";
import { trackDeprecatedRedirect } from "@/lib/analytics";

export default function GrossScoresLayout() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { member, loading, societyId } = useBootstrap();
  const permissions = getPermissionsForMember(member);
  const canAccessScorecardUi =
    permissions.canManageHandicaps || isCaptain(member) || isSecretary(member);

  const [eventLoading, setEventLoading] = useState(true);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!eventId) {
        if (!cancelled) {
          setLiveEnabled(false);
          setEventLoading(false);
        }
        return;
      }
      try {
        const ev = await getEvent(eventId);
        if (!cancelled) {
          setLiveEnabled(isLiveGrossScoringEnabledForEvent(ev));
        }
      } catch {
        if (!cancelled) setLiveEnabled(false);
      } finally {
        if (!cancelled) setEventLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (loading || eventLoading) return;
    if (!canAccessScorecardUi) return;
    if (liveEnabled) return;
    if (!eventId) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    trackDeprecatedRedirect({
      feature: "live_gross_scoring",
      oldRoute: `/(app)/event/[id]/gross-scores`,
      destinationRoute: "/(app)/event/[id]",
      societyId,
      screen: "gross-scores",
    });
    router.replace({ pathname: "/(app)/event/[id]", params: { id: eventId } } as never);
  }, [loading, eventLoading, canAccessScorecardUi, liveEnabled, eventId, router, societyId]);

  if (loading || eventLoading) {
    return (
      <Screen>
        <LoadingState message="Loading..." />
      </Screen>
    );
  }

  if (!canAccessScorecardUi) {
    return (
      <Screen>
        <EmptyState title="Scorecard" message="This feature is temporarily unavailable." />
      </Screen>
    );
  }

  if (!liveEnabled) {
    return (
      <Screen>
        <LoadingState message="Live scoring is not enabled for this event…" />
      </Screen>
    );
  }

  return <Slot />;
}
