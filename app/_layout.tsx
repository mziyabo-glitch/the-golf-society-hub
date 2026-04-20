import "@/lib/ui/themeSplash";
import { useEffect, useRef } from "react";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import { StyleSheet, View } from "react-native";
import { BootstrapProvider, useBootstrap } from "@/lib/useBootstrap";
import { LoadingState } from "@/components/ui/LoadingState";
import { AuthScreen } from "@/components/AuthScreen";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";
import { ThemeProvider, useTheme } from "@/lib/ui/themeContext";
import { FontScaleProvider } from "@/lib/ui/fontScaleContext";
import { consumePendingInviteToken } from "@/lib/sinbookInviteToken";
import { consumePendingRivalryJoinCode } from "@/lib/pendingRivalryJoinCode";
import { consumePendingSocietyJoinCode } from "@/lib/pendingSocietyJoinCode";
import { consumePendingPostAuthRedirect } from "@/lib/pendingPostAuthRedirect";
import { blurWebActiveElement } from "@/lib/ui/focus";
import { isEventRsvpInvitePath } from "@/lib/eventInviteLink";
import { StatusBar } from "expo-status-bar";

const APP_TABS = "/(app)/(tabs)";
const JOIN_FLOW_SEGMENTS = new Set(["onboarding", "join", "join-society", "invite"]);
const JOIN_RIVALRY_SEGMENT = "join-rivalry";

function isJoinFlowRoute(pathname?: string, seg0?: string): boolean {
  if (isEventRsvpInvitePath(pathname)) return false;
  if (typeof seg0 === "string" && (JOIN_FLOW_SEGMENTS.has(seg0) || seg0 === JOIN_RIVALRY_SEGMENT)) return true;
  if (typeof pathname !== "string") return false;
  return (
    pathname === "/join" ||
    pathname === "/join-society" ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname === "/join-rivalry" ||
    pathname.startsWith("/join-rivalry") ||
    pathname.startsWith("/invite/")
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
  const { loading, authRestoring, error, isSignedIn, activeSocietyId, profile, refresh } = useBootstrap();
  const { ready: themeReady } = useTheme();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const colors = getColors();

  const isPublicPath =
    pathname === "/reset-password" ||
    pathname === "/privacy-policy" ||
    pathname === "/sign-in" ||
    (typeof pathname === "string" && pathname.startsWith("/sign-in"));

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

  useEffect(() => {
    // Route as soon as auth is known; profile/membership loading can continue in-app.
    if (authRestoring || !isSignedIn) {
      return;
    }

    // Prevent routing loops - only route once per bootstrap cycle
    if (hasRouted.current) {
      return;
    }

    const inOnboarding = segments[0] === "onboarding" || segments[0] === "join" || segments[0] === "join-society";
    const inSinbookInvite = segments[0] === "sinbook";
    const inPublicRoute =
      isPublicPath ||
      segments[0] === "reset-password" ||
      segments[0] === "privacy-policy" ||
      segments[0] === "sign-in" ||
      isEventRsvpInvitePath(pathname);
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
      console.log("[_layout:redirect] route-guard state", {
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
      console.log("[_layout:redirect] decision=profile_incomplete → /(app)/my-profile");
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
      console.log("[_layout:redirect] decision=has_society_in_join_flow → dashboard or pending deep link");
      hasRouted.current = true;
      consumePendingRivalryJoinCode().then((code) => {
        if (code) {
          console.log("[_layout:redirect] decision=resume_pending_rivalry_code_in_join_flow");
          blurWebActiveElement();
          router.replace({ pathname: "/join-rivalry", params: { code } });
          return;
        }
        consumePendingInviteToken().then((token) => {
          if (token) {
            console.log("[_layout:redirect] decision=resume_pending_sinbook_invite_in_join_flow", { token });
            blurWebActiveElement();
            router.replace({ pathname: "/sinbook/invite/[token]", params: { token } });
          } else {
            console.log("[_layout:redirect] decision=join_flow_default_to_tabs");
            blurWebActiveElement();
            router.replace(APP_TABS);
          }
        });
      });
    }
    // No society + not on onboarding = Personal Mode — let (app) handle it
  }, [authRestoring, isSignedIn, activeSocietyId, profile, segments, pathname, router, isPublicPath]);

  // Reset hasRouted only on sign-out, not on every bootstrap refresh.
  // This prevents the guard from re-routing after each refresh cycle.
  useEffect(() => {
    if ((loading || authRestoring) && !isSignedIn) {
      hasRouted.current = false;
      lastState.current = "";
    }
  }, [loading, authRestoring, isSignedIn]);

  // Auth-aware redirect: once hydrated and signed in, enter correct flow.
  useEffect(() => {
    if (authRestoring || !isSignedIn) return;
    if (pathname === "/reset-password" || pathname === "/privacy-policy") return;
    let active = true;

    const routeSignedInUser = async () => {
      const pendingPostAuth = await consumePendingPostAuthRedirect();
      if (!active) return;
      if (pendingPostAuth && pendingPostAuth.startsWith("/")) {
        console.log("[_layout:redirect] decision=pending_post_auth_redirect", { pendingPostAuth });
        blurWebActiveElement();
        router.replace(pendingPostAuth as never);
        return;
      }

      const seg0 = segments[0];
      const inJoinFlow = isJoinFlowRoute(pathname, seg0);
      const onSignIn = pathname === "/sign-in" || (typeof pathname === "string" && pathname.startsWith("/sign-in"));
      if (inJoinFlow || isToolRoute(pathname, seg0) || isEventRsvpInvitePath(pathname) || onSignIn) return;
      const inApp = seg0 === "(app)" || (typeof pathname === "string" && pathname.startsWith("/(app)"));
      if (inApp) return;

      const pendingRivalryCode = await consumePendingRivalryJoinCode();
      if (!active) return;
      if (pendingRivalryCode) {
        console.log("[_layout:redirect] decision=pending_rivalry_code → /join-rivalry");
        blurWebActiveElement();
        router.replace({ pathname: "/join-rivalry", params: { code: pendingRivalryCode } });
        return;
      }

      const pendingSocietyCode = await consumePendingSocietyJoinCode();
      if (!active) return;
      if (pendingSocietyCode) {
        console.log("[_layout:redirect] decision=pending_society_code → /onboarding join");
        blurWebActiveElement();
        router.replace({ pathname: "/onboarding", params: { mode: "join", code: pendingSocietyCode, invite: "1" } });
        return;
      }

      console.log("[_layout:redirect] decision=signed_in_default → /(app)/(tabs)");
      blurWebActiveElement();
      router.replace(APP_TABS);
    };

    void routeSignedInUser();
    return () => {
      active = false;
    };
  }, [authRestoring, isSignedIn, segments, pathname, router]);

  // Determine which overlay to show (if any).
  // The Stack ALWAYS renders so expo-router can match child routes.
  // Public routes are accessible without sign-in (OAuth callback, password reset).
  const isPublicRoute =
    isPublicPath ||
    segments[0] === "reset-password" ||
    segments[0] === "privacy-policy" ||
    segments[0] === "sign-in" ||
    isEventRsvpInvitePath(pathname);
  // Keep auth gate blocked only while auth session is unknown; once known,
  // the app can render immediately while profile/membership continues loading.
  const showLoading = authRestoring || !themeReady;
  const showAuth = !authRestoring && !isSignedIn && !isPublicRoute;
  const showError = !authRestoring && !showAuth && !!error;

  useEffect(() => {
    console.log("[_layout:redirect] guard inputs", {
      authRestoring,
      loading,
      isSignedIn,
      activeSocietyId,
      hasProfile: !!profile,
      pathname,
      segments: segments.join("/"),
      isPublicRoute,
      showLoading,
      showAuth,
      showError,
    });
  }, [authRestoring, loading, isSignedIn, activeSocietyId, profile, pathname, segments, isPublicRoute, showLoading, showAuth, showError]);

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
    <ThemeProvider>
      <FontScaleProvider>
        <StatusBar style="auto" />
        <BootstrapProvider>
          <RootNavigator />
        </BootstrapProvider>
      </FontScaleProvider>
    </ThemeProvider>
  );
}
