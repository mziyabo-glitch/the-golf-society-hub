/**
 * Legacy Society stub — redirected to Settings (Phase 2 de-bloat).
 * Route kept so bookmarked URLs do not 404 inside the authenticated app.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { LoadingState } from "@/components/ui/LoadingState";
import { trackDeprecatedRedirect } from "@/lib/analytics";
import { useBootstrap } from "@/lib/useBootstrap";

export default function SocietyDashboardScreen() {
  const router = useRouter();
  const { societyId } = useBootstrap();
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;
    trackDeprecatedRedirect({
      feature: "legacy_society_stub",
      oldRoute: "/(app)/society",
      destinationRoute: "/(app)/(tabs)/settings",
      societyId,
      screen: "society",
    });
    router.replace("/(app)/(tabs)/settings" as never);
  }, [router, societyId]);

  return (
    <Screen>
      <LoadingState message="Opening society settings…" />
    </Screen>
  );
}
