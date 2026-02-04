import { useEffect, useRef } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { View } from "react-native";
import { BootstrapProvider, useBootstrap } from "@/lib/useBootstrap";
import { LoadingState } from "@/components/ui/LoadingState";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";

function RootNavigator() {
  const { loading, error, activeSocietyId, refresh } = useBootstrap();
  const segments = useSegments();
  const router = useRouter();
  const colors = getColors();

  // Track if we've already routed to prevent loops
  const hasRouted = useRef(false);
  // Track last known state to prevent redundant logs
  const lastState = useRef<string>("");

  useEffect(() => {
    // Don't route while loading
    if (loading) {
      return;
    }

    // Prevent routing loops - only route once per bootstrap cycle
    if (hasRouted.current) {
      return;
    }

    const inOnboarding = segments[0] === "onboarding";
    const hasSociety = !!activeSocietyId;

    // Create a state key to detect actual changes
    const stateKey = `${hasSociety}-${inOnboarding}-${segments.join("/")}`;

    // Only log if state actually changed
    if (stateKey !== lastState.current) {
      lastState.current = stateKey;
      console.log("[_layout] Route guard check:", {
        hasSociety,
        activeSocietyId,
        inOnboarding,
        segments: segments.join("/"),
      });
    }

    if (!hasSociety && !inOnboarding) {
      // No society and not on onboarding -> go to onboarding
      console.log("[_layout] No society, redirecting to /onboarding");
      hasRouted.current = true;
      router.replace("/onboarding");
    } else if (hasSociety && inOnboarding) {
      // Has society but on onboarding -> go to app home
      console.log("[_layout] Has society, redirecting to /(app)/(tabs)");
      hasRouted.current = true;
      router.replace("/(app)/(tabs)");
    }
    // Note: Removed "no redirect needed" log to reduce console spam
  }, [loading, activeSocietyId, segments, router]);

  // Reset hasRouted when loading changes (new bootstrap cycle)
  useEffect(() => {
    if (loading) {
      hasRouted.current = false;
      lastState.current = "";
    }
  }, [loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <LoadingState message="Loading your golf society..." />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background, padding: spacing.lg }}>
        <AppCard>
          <AppText variant="h2" style={{ marginBottom: spacing.sm }}>Something went wrong</AppText>
          <AppText variant="body" color="secondary" style={{ marginBottom: spacing.lg }}>{error}</AppText>
          <PrimaryButton onPress={refresh}>Try Again</PrimaryButton>
        </AppCard>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <BootstrapProvider>
      <RootNavigator />
    </BootstrapProvider>
  );
}
