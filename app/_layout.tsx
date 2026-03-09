import { useEffect, useRef } from "react";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import { StyleSheet, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { BootstrapProvider, useBootstrap } from "@/lib/useBootstrap";
import { LoadingState } from "@/components/ui/LoadingState";
import { AuthScreen } from "@/components/AuthScreen";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";
import { consumePendingInviteToken } from "@/lib/sinbookInviteToken";
import { consumePendingRivalryJoinCode } from "@/lib/pendingRivalryJoinCode";
import { blurWebActiveElement } from "@/lib/ui/focus";

const APP_TABS = "/(app)/(tabs)";
const JOIN_FLOW_SEGMENTS = new Set(["onboarding", "join", "join-society"]);
const JOIN_RIVALRY_SEGMENT = "join-rivalry";

function isJoinFlowRoute(pathname?: string, seg0?: string): boolean {
  if (typeof seg0 === "string" && (JOIN_FLOW_SEGMENTS.has(seg0) || seg0 === JOIN_RIVALRY_SEGMENT)) return true;
  if (typeof pathname !== "string") return false;
  return (
    pathname === "/join" ||
    pathname === "/join-society" ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname === "/join-rivalry" ||
    pathname.startsWith("/join-rivalry")
  );
}

/** Routes that must never be redirected away from by any guard. */
function isToolRoute(pathname?: string, seg0?: string): boolean {
  if (seg0 === "(share)") return true;
  if (typeof pathname !== "string") return false;
  return (
    pathname.startsWith("/(share)") ||
    pathname.startsWith("/tee-sheet") ||
    pathname.startsWith("/(app)/tee-sheet")
  );
}

function RootNavigator() {
  const { loading, error, isSignedIn, activeSocietyId, profile, refresh } = useBootstrap();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const colors = getColors();

  const isPublicPath = pathname === "/reset-password";

  // Track if we've already routed to prevent loops
  const hasRouted = useRef(false);
  // Track last known state to prevent redundant logs
  const lastState = useRef<string>("");
  // Timestamp of last time activeSocietyId was truthy — used to debounce
  // transient null→true→null flickers during post-join bootstrap.
  const lastHadSocietyAt = useRef<number>(0);

  if (activeSocietyId) {
    lastHadSocietyAt.current = Date.now();
  }

  // Global auth gate: getSession on mount + onAuthStateChange
  // Redirects immediately when session appears (avoids staying on sign-in)
  const pathnameRef = useRef(pathname);
  const segmentsRef = useRef(segments);
  pathnameRef.current = pathname;
  segmentsRef.current = segments;

  useEffect(() => {
    let mounted = true;

    const applyAuthRedirect = async (session: { user: { id: string } } | null) => {
      if (!mounted) return;
      const seg0 = segmentsRef.current[0];
      const p = pathnameRef.current;
      const inApp = seg0 === "(app)" || seg0 === "app" || (typeof p === "string" && p?.startsWith("/(app)"));
      const inPublic = p === "/reset-password" || seg0 === "reset-password";
      const inJoinFlow = isJoinFlowRoute(p, seg0);
      if (inPublic || inJoinFlow || isToolRoute(p, seg0)) return;

      if (session && !inApp) {
        const pendingRivalryCode = await consumePendingRivalryJoinCode();
        if (!mounted) return;
        if (pendingRivalryCode) {
          console.log("[_layout] Auth gate: resuming rivalry join with code");
          blurWebActiveElement();
          router.replace({ pathname: "/join-rivalry", params: { code: pendingRivalryCode } });
        } else {
          console.log("[_layout] Auth gate: session present, redirecting to", APP_TABS);
          blurWebActiveElement();
          router.replace(APP_TABS);
        }
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void applyAuthRedirect(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[_layout] Auth state change:", event, session ? "has session" : "no session");
      void applyAuthRedirect(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    // Don't route while loading or not signed in
    if (loading || !isSignedIn) {
      return;
    }

    // Prevent routing loops - only route once per bootstrap cycle
    if (hasRouted.current) {
      return;
    }

    const inOnboarding = segments[0] === "onboarding" || segments[0] === "join" || segments[0] === "join-society";
    const inSinbookInvite = segments[0] === "sinbook";
    const inPublicRoute = isPublicPath || segments[0] === "reset-password";
    const inJoinFlow = isJoinFlowRoute(pathname, segments[0]);
    const inMyProfile = pathname === "/(app)/my-profile";
    const hasSociety = !!activeSocietyId;
    const needsProfileCompletion = !!profile && !profile.profile_complete;

    // Debounce: if the user recently had a society (within 10s), treat a
    // transient hasSociety=false as still-resolving. This prevents the
    // route guard from bouncing the user back to personal mode during the
    // brief window after join where bootstrap is re-reading from DB.
    const recentlyHadSociety =
      !hasSociety && lastHadSocietyAt.current > 0 && Date.now() - lastHadSocietyAt.current < 10_000;

    // Create a state key to detect actual changes
    const stateKey = `${hasSociety}-${inOnboarding}-${inJoinFlow}-${inSinbookInvite}-${needsProfileCompletion}-${segments.join("/")}`;

    if (stateKey !== lastState.current) {
      lastState.current = stateKey;
      console.log("[_layout] Route guard:", {
        hasSociety,
        activeSocietyId,
        inJoinFlow,
        recentlyHadSociety,
        segments: segments.join("/"),
      });
    }

    // Exempt routes that handle their own flow
    if (inSinbookInvite || inPublicRoute || isToolRoute(pathname, segments[0])) {
      return;
    }
    if (pathname === "/join-rivalry" || (typeof pathname === "string" && pathname.startsWith("/join-rivalry"))) {
      return;
    }

    // If society state is still resolving after a recent join, wait.
    if (!hasSociety && inJoinFlow && !recentlyHadSociety) {
      return;
    }
    if (recentlyHadSociety && !inJoinFlow) {
      return;
    }

    // Force profile completion before anything else
    if (needsProfileCompletion && !inMyProfile && hasSociety) {
      console.log("[_layout] Profile incomplete, redirecting to /my-profile");
      hasRouted.current = true;
      blurWebActiveElement();
      router.replace("/(app)/my-profile");
      return;
    }

    // Once society context exists, avoid non-essential redirect churn.
    if (hasSociety && !inJoinFlow) {
      return;
    }

    if (hasSociety && inJoinFlow) {
      console.log("[_layout] Has society + in join flow, redirecting to dashboard");
      hasRouted.current = true;
      consumePendingRivalryJoinCode().then((code) => {
        if (code) {
          console.log("[_layout] Resuming rivalry join with code");
          blurWebActiveElement();
          router.replace({ pathname: "/join-rivalry", params: { code } });
          return;
        }
        consumePendingInviteToken().then((token) => {
          if (token) {
            console.log("[_layout] Resuming sinbook invite:", token);
            blurWebActiveElement();
            router.replace({ pathname: "/sinbook/invite/[token]", params: { token } });
          } else {
            blurWebActiveElement();
            router.replace(APP_TABS);
          }
        });
      });
    }
    // No society + not on onboarding = Personal Mode — let (app) handle it
  }, [loading, isSignedIn, activeSocietyId, profile, segments, pathname, router, isPublicPath]);

  // Reset hasRouted only on sign-out, not on every bootstrap refresh.
  // This prevents the guard from re-routing after each refresh cycle.
  useEffect(() => {
    if (loading && !isSignedIn) {
      hasRouted.current = false;
      lastState.current = "";
    }
  }, [loading, isSignedIn]);

  // Auth-aware redirect: when session appears, ensure we're in the app (avoids staying on sign-in)
  useEffect(() => {
    if (loading || !isSignedIn || isPublicPath) return;
    const seg0 = segments[0];
    const inJoinFlow = isJoinFlowRoute(pathname, seg0);
    if (inJoinFlow || isToolRoute(pathname, seg0)) return;
    const inApp = seg0 === "(app)" || seg0 === "app" || (typeof pathname === "string" && pathname.startsWith("/(app)"));
    if (inApp) return;
    console.log("[_layout] Session present but not in app, redirecting");
    blurWebActiveElement();
    router.replace(APP_TABS);
  }, [loading, isSignedIn, isPublicPath, segments, pathname, router]);

  // Determine which overlay to show (if any).
  // The Stack ALWAYS renders so expo-router can match child routes.
  // Public routes are accessible without sign-in (OAuth callback, password reset).
  const isPublicRoute = isPublicPath || segments[0] === "reset-password";
  const showLoading = loading;
  const showAuth = !loading && !isSignedIn && !isPublicRoute;
  const showError = !loading && !showAuth && !!error;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Always render the navigator so expo-router can resolve all routes */}
      <Stack screenOptions={{ headerShown: false }} />

      {/* Overlay: loading spinner */}
      {showLoading && (
        <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center", backgroundColor: colors.background }]}>
          <LoadingState message="Loading..." />
        </View>
      )}

      {/* Overlay: auth gate (except for public routes like /reset-password) */}
      {showAuth && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
          <AuthScreen />
        </View>
      )}

      {/* Overlay: error state */}
      {showError && (
        <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center", backgroundColor: colors.background, padding: spacing.lg }]}>
          <AppCard>
            <AppText variant="h2" style={{ marginBottom: spacing.sm }}>Something went wrong</AppText>
            <AppText variant="body" color="secondary" style={{ marginBottom: spacing.lg }}>{typeof error === "string" ? error : "An unexpected error occurred."}</AppText>
            <PrimaryButton onPress={refresh}>Try Again</PrimaryButton>
          </AppCard>
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <BootstrapProvider>
      <RootNavigator />
    </BootstrapProvider>
  );
}
