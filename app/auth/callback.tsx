import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { getColors, spacing } from "@/lib/ui/theme";
import { supabase } from "@/lib/supabase";

function looksLikeMagicLink(url: string): boolean {
  return url.includes("code=") || url.includes("access_token=");
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const colors = getColors();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const handleCallback = async () => {
      try {
        const url =
          Platform.OS === "web"
            ? window.location.href
            : await Linking.getInitialURL();

        if (!url || !looksLikeMagicLink(url)) {
          throw new Error("Invalid or missing sign-in link.");
        }

        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(url);
        if (exchangeError) {
          throw exchangeError;
        }

        if (mounted) {
          router.replace("/");
        }
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || "Failed to complete sign-in.");
        }
      }
    };

    handleCallback();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (error) {
    return (
      <Screen scrollable={false}>
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
          <AppCard>
            <AppText variant="h2" style={{ marginBottom: spacing.sm }}>
              Sign-in failed
            </AppText>
            <AppText variant="body" color="secondary" style={{ marginBottom: spacing.lg }}>
              {error}
            </AppText>
            <PrimaryButton onPress={() => router.replace("/login")}>
              Back to Sign In
            </PrimaryButton>
          </AppCard>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scrollable={false}>
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <LoadingState message="Signing you in..." />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
