/**
 * /auth/callback — OAuth redirect landing page.
 *
 * Web:    After Google OAuth, Supabase redirects here with a PKCE code in the
 *         query string (?code=...). detectSessionInUrl is false, so this page
 *         explicitly exchanges the code for a session via oauthCallback, then
 *         redirects to the app root.
 *
 * Native: The in-app browser intercepts the redirect URL before this route
 *         renders, so this file is primarily for web.
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { PrimaryButton } from "@/components/ui/Button";
import {
  clearOAuthCallbackUrl,
  establishOAuthSessionFromCurrentUrl,
} from "@/lib/oauthCallback";
import { spacing } from "@/lib/ui/theme";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      const result = await establishOAuthSessionFromCurrentUrl();
      if (cancelled) return;

      if (result.success) {
        console.log("[auth/callback] OAuth session established via:", result.source);
        clearOAuthCallbackUrl();
        router.replace("/");
        return;
      }

      console.error("[auth/callback] Failed:", result.error);
      setError(result.error || "Could not complete sign-in. Please try again.");
    }

    handleCallback();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <Screen>
        <View style={styles.container}>
          <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.lg }} />
          <PrimaryButton onPress={() => router.replace("/")}>
            Back to Sign In
          </PrimaryButton>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        <LoadingState message="Completing sign-in..." />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
