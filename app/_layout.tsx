// app/_layout.tsx
import { Stack } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { firebaseEnvMissingKeys, firebaseEnvReady } from "@/lib/firebase";

export default function RootLayout() {
  const bootError = useMemo(() => {
    if (firebaseEnvReady) return null;
    return "Missing environment variables:\n" + firebaseEnvMissingKeys.join("\n");
  }, []);

  // If env missing, show a friendly screen instead of a silent blank deploy.
  if (!firebaseEnvReady) {
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
            Fix this in Vercel → Project → Settings → Environment Variables. Ensure the
            variables exist for the environment you’re deploying (Preview AND Production).
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

  // IMPORTANT:
  // Your actual app lives under the route group: app/(app)/...
  // We mount that group as the main stack entry.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(app)" />

      {/* Standalone screens outside (app) */}
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
