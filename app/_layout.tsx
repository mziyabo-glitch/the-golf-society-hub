import { Stack } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { firebaseEnvMissingKeys, firebaseEnvReady } from "@/lib/firebase";

/**
 * Root Layout
 * - Keep this minimal to avoid "No route named X" warnings
 * - Shows a friendly Firebase env screen if EXPO_PUBLIC_FIREBASE_* are missing
 */

export default function RootLayout() {
  const bootError = useMemo(() => {
    if (firebaseEnvReady) return null;
    return "Missing environment variables:\n" + firebaseEnvMissingKeys.join("\n");
  }, []);

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

  // IMPORTANT:
  // Do NOT manually list screens here unless you *must*.
  // Expo Router auto-discovers routes. Manual Stack.Screen entries
  // cause "No route named X exists" when routes move.
  return (
    <Stack screenOptions={{ headerShown: false }}>
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
