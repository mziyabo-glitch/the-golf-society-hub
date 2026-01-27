import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { View } from "react-native";
import { BootstrapProvider, useBootstrap } from "@/lib/useBootstrap";
import { LoadingState } from "@/components/ui/LoadingState";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";

function RootNavigator() {
  const { loading, error, societyId, refresh } = useBootstrap();
  const segments = useSegments();
  const router = useRouter();
  const colors = getColors();

  useEffect(() => {
    if (loading) return;

    const inOnboarding = segments[0] === "onboarding";
    const hasSociety = !!societyId;

    if (!hasSociety && !inOnboarding) {
      router.replace("/onboarding");
    } else if (hasSociety && inOnboarding) {
      router.replace("/(app)/(tabs)");
    }
  }, [loading, societyId, segments, router]);

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
  useEffect(() => {
    if (!__DEV__) return;
    if (typeof window === "undefined") return;

    let active = true;
    import("@/lib/dev/supabaseDevTest").then(({ runSupabaseDevTest }) => {
      if (!active) return;
      const win = window as any;
      win.runSupabaseDevTest = runSupabaseDevTest;
    });

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        const win = window as any;
        delete win.runSupabaseDevTest;
      }
    };
  }, []);

  return (
    <BootstrapProvider>
      <RootNavigator />
    </BootstrapProvider>
  );
}
