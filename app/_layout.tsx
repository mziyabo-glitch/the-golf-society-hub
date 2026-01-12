import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { spacing } from "@/lib/ui/theme";

import { initActiveSocietyId, ensureSignedIn } from "@/lib/firebase";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const boot = useCallback(async () => {
    setBooting(true);
    setBootError(null);

    try {
      // 1) Always have a user (anonymous is fine)
      await ensureSignedIn();

      // 2) Load + cache activeSocietyId from Firestore (ONLINE source of truth)
      // This must complete before any society screens render.
      await initActiveSocietyId();
    } catch (e: any) {
      console.error("[RootLayout] Init error:", e);
      setBootError(e?.message ?? "Startup error");
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // ✅ Block the app until Firebase bootstrapping is complete
  if (booting) {
    return (
      <ErrorBoundary>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <View style={{ flex: 1, justifyContent: "center", padding: spacing.lg }}>
            <AppText variant="title" style={{ marginBottom: spacing.sm }}>
              Starting up…
            </AppText>
            <AppText variant="subtle">Connecting to Firebase and loading society…</AppText>
          </View>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  if (bootError) {
    return (
      <ErrorBoundary>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <View style={{ flex: 1, justifyContent: "center", padding: spacing.lg }}>
            <AppText variant="title" style={{ marginBottom: spacing.sm }}>
              Startup Error
            </AppText>
            <AppText variant="subtle" style={{ marginBottom: spacing.lg }}>
              {bootError}
            </AppText>
            <PrimaryButton title="Try Again" onPress={() => void boot()} />
          </View>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="event/[id]" options={{ title: "Event" }} />
          <Stack.Screen name="event/[id]/results" options={{ title: "Results" }} />
          <Stack.Screen name="event/[id]/players" options={{ title: "Players" }} />
          <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
