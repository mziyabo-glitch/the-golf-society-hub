// app/_layout.tsx
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";

/**
 * We intentionally hard-fail if EXPO_PUBLIC_FIREBASE_* env vars are missing
 * (otherwise Firestore fails with 400 / Listen transport errors).
 *
 * This layout catches that error and shows a friendly setup screen instead of a blank crash.
 */

export default function RootLayout() {
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    // Catch errors thrown during module init (firebase.ts)
    const handler = (event: any) => {
      const msg = String(event?.error?.message ?? event?.message ?? "");
      if (msg.includes("Missing environment variable: EXPO_PUBLIC_FIREBASE_")) {
        setBootError(msg);
        event?.preventDefault?.();
        return;
      }
    };

    // web
    if (typeof window !== "undefined") {
      window.addEventListener("error", handler);
      window.addEventListener("unhandledrejection", handler as any);
      return () => {
        window.removeEventListener("error", handler);
        window.removeEventListener("unhandledrejection", handler as any);
      };
    }
  }, []);

  if (bootError) {
    return (
      <Screen>
        <View style={styles.card}>
          <AppText style={styles.title}>App configuration missing</AppText>
          <AppText style={styles.body}>
            Your deployment is missing Firebase environment variables.
          </AppText>

          <View style={{ height: 12 }} />

          <AppText style={styles.mono}>{bootError}</AppText>

          <View style={{ height: 12 }} />

          <AppText style={styles.body}>
            Fix this in Vercel → Project → Settings → Environment Variables.
            Ensure the variables exist for the environment you’re deploying
            (Preview AND Production if you use both).
          </AppText>

          <View style={{ height: 12 }} />

          <AppText style={styles.body}>
            Required keys:
            {"\n"}• EXPO_PUBLIC_FIREBASE_API_KEY
            {"\n"}• EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
            {"\n"}• EXPO_PUBLIC_FIREBASE_PROJECT_ID
            {"\n"}• EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
            {"\n"}• EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
            {"\n"}• EXPO_PUBLIC_FIREBASE_APP_ID
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="join" />
      <Stack.Screen name="join-society" />
      <Stack.Screen name="create-society" />
      <Stack.Screen name="create-event" />
      <Stack.Screen name="add-member" />
      <Stack.Screen name="finance" />
      <Stack.Screen name="finance-events" />
      <Stack.Screen name="event" />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    gap: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  body: {
    opacity: 0.85,
    lineHeight: 20,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 12,
    opacity: 0.85,
  },
});
