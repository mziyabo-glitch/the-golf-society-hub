import { useEffect, useRef } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StyleSheet, View } from "react-native";
import { BootstrapProvider, useBootstrap } from "@/lib/useBootstrap";
import { LoadingState } from "@/components/ui/LoadingState";
import { AuthScreen } from "@/components/AuthScreen";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";
import { consumePendingInviteToken } from "@/lib/sinbookInviteToken";

function RootNavigator() {
  const { loading, error, isSignedIn, activeSocietyId, refresh } = useBootstrap();
  const segments = useSegments();
  const router = useRouter();
  const colors = getColors();

  // Track if we've already routed to prevent loops
  const hasRouted = useRef(false);
  // Track last known state to prevent redundant logs
  const lastState = useRef<string>("");

  useEffect(() => {
    // Don't route while loading or not signed in
    if (loading || !isSignedIn) {
      return;
    }

    // Prevent routing loops - only route once per bootstrap cycle
    if (hasRouted.current) {
      return;
    }

    const inOnboarding = segments[0] === "onboarding";
    const inSinbookInvite = segments[0] === "sinbook";
    const hasSociety = !!activeSocietyId;

    // Create a state key to detect actual changes
    const stateKey = `${hasSociety}-${inOnboarding}-${inSinbookInvite}-${segments.join("/")}`;

    // Only log if state actually changed
    if (stateKey !== lastState.current) {
      lastState.current = stateKey;
      console.log("[_layout] Route guard check:", {
        hasSociety,
        activeSocietyId,
        inOnboarding,
        inSinbookInvite,
        segments: segments.join("/"),
      });
    }

    // Exempt: sinbook invite routes handle their own auth flow
    if (inSinbookInvite) {
      return;
    }

    if (hasSociety && inOnboarding) {
      // Has society but on onboarding -> go to app home
      // Check for pending sinbook invite token first
      console.log("[_layout] Has society, checking pending invite token...");
      hasRouted.current = true;
      consumePendingInviteToken().then((token) => {
        if (token) {
          console.log("[_layout] Resuming sinbook invite:", token);
          router.replace({ pathname: "/sinbook/invite/[token]", params: { token } });
        } else {
          router.replace("/(app)/(tabs)");
        }
      });
    }
    // No society + not on onboarding = Personal Mode — let (app) handle it
  }, [loading, isSignedIn, activeSocietyId, segments, router]);

  // Reset hasRouted when loading changes (new bootstrap cycle)
  useEffect(() => {
    if (loading) {
      hasRouted.current = false;
      lastState.current = "";
    }
  }, [loading]);

  // Determine which overlay to show (if any).
  // The Stack ALWAYS renders so expo-router can match child routes like /reset-password.
  const isPublicRoute = segments[0] === "reset-password";
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
            <AppText variant="body" color="secondary" style={{ marginBottom: spacing.lg }}>{error}</AppText>
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
