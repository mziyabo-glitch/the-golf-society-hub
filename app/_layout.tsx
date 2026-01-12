import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { spacing } from "@/lib/ui/theme";

import { ensureSignedIn, initActiveSocietyId } from "@/lib/firebase";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      try {
        // 1️⃣ Always have a user
        await ensureSignedIn();

        // 2️⃣ Load activeSocietyId from Firestore INTO MEMORY
        await initActiveSocietyId();
      } catch (e: any) {
        console.error("[BOOT] failed", e);
        setBootError(e?.message ?? "Startup failed");
      } finally {
        setBooting(false);
      }
    };

    void boot();
  }, []);

  // 🚫 HARD BLOCK — nothing renders before Firebase is ready
  if (booting) {
    return (
      <ErrorBoundary>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <View style={{ flex: 1, justifyContent: "center", padding: spacing.lg }}>
            <AppText variant="title">Starting up…</AppText>
            <AppText variant="subtle">
              Connecting to Firebase and loading society…
            </AppText>
          </View>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  // 🚫 HARD FAIL (rare, but explicit)
  if (bootError) {
    return (
      <ErrorBoundary>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <View style={{ flex: 1, justifyContent: "center", padding: spacing.lg }}>
            <AppText variant="title">Startup Error</AppText>
            <AppText variant="subtle" style={{ marginBottom: spacing.lg }}>
              {bootError}
            </AppText>
            <PrimaryButton title="Retry" onPress={() => setBooting(true)} />
          </View>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  // ✅ SAFE: activeSocietyId is now loaded (or null intentionally)
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
