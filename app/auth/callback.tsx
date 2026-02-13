/**
 * /auth/callback — OAuth redirect landing page.
 *
 * Web:    After Google OAuth, Supabase redirects here with tokens in the URL
 *         hash (#access_token=...&refresh_token=...). The Supabase client's
 *         detectSessionInUrl: true picks them up automatically. We just wait
 *         for the session then redirect to the app root.
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
import { supabase } from "@/lib/supabase";
import { getColors, spacing } from "@/lib/ui/theme";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const colors = getColors();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        // On web, detectSessionInUrl should have already processed the hash.
        // But as a safety net, try manual extraction if no session exists yet.
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          console.log("[auth/callback] Session found, redirecting to app");
          router.replace("/");
          return;
        }

        // Manual fallback: parse hash tokens
        if (typeof window !== "undefined" && window.location.hash) {
          const hash = window.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              console.error("[auth/callback] setSession error:", sessionError);
              setError(sessionError.message);
              return;
            }

            console.log("[auth/callback] Session set from hash, redirecting");
            router.replace("/");
            return;
          }
        }

        // Give detectSessionInUrl a moment to process
        await new Promise((r) => setTimeout(r, 1500));

        const { data: retryData } = await supabase.auth.getSession();
        if (retryData.session) {
          router.replace("/");
          return;
        }

        setError("Could not complete sign-in. Please try again.");
      } catch (e: any) {
        console.error("[auth/callback] error:", e);
        setError(e?.message || "Something went wrong.");
      }
    }

    handleCallback();
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
