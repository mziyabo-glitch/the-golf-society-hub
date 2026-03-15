/**
 * Auth Callback — PUBLIC route for OAuth and magic link redirects.
 *
 * Flow:
 * 1. User completes OAuth (Google/Apple) or clicks magic link
 * 2. Supabase redirects to /auth/callback#access_token=...&refresh_token=...&type=...
 * 3. This screen parses the hash, calls setSession(), then redirects to app
 */

import { useEffect, useState } from "react";
import { StyleSheet, View, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryButton } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { getColors } from "@/lib/ui/theme";

function getHashFromUrl(): string {
  if (typeof window !== "undefined" && window.location?.hash) {
    return window.location.hash.substring(1);
  }
  return "";
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const colors = getColors();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function handleCallback() {
      try {
        let hash = getHashFromUrl();
        if (!hash && Platform.OS !== "web") {
          const url = await Linking.getInitialURL();
          if (url) {
            const idx = url.indexOf("#");
            hash = idx >= 0 ? url.substring(idx + 1) : "";
          }
        }
        const params = new URLSearchParams(hash);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");

        if (!accessToken || !refreshToken) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session && mounted) {
            setStatus("success");
            router.replace("/(app)/(tabs)");
            return;
          }
          setStatus("error");
          setErrorMessage("Invalid or expired link. Please try signing in again.");
          return;
        }

        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (!mounted) return;

        if (error) {
          setStatus("error");
          setErrorMessage(error.message || "Sign-in failed. Please try again.");
          return;
        }

        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }

        setStatus("success");
        router.replace("/(app)/(tabs)");
      } catch (e: unknown) {
        if (!mounted) return;
        setStatus("error");
        setErrorMessage(
          e instanceof Error ? e.message : "Something went wrong. Please try again."
        );
      }
    }

    handleCallback();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (status === "loading") {
    return (
      <Screen>
        <View style={styles.center}>
          <LoadingState message="Completing sign-in..." />
        </View>
      </Screen>
    );
  }

  if (status === "error") {
    return (
      <Screen>
        <View style={styles.center}>
          <AppText variant="title" style={styles.errorTitle}>
            Sign-in Failed
          </AppText>
          <AppText variant="body" color="secondary" style={styles.errorMessage}>
            {errorMessage}
          </AppText>
          <PrimaryButton
            onPress={() => router.replace("/")}
            style={styles.button}
          >
            Back to Sign In
          </PrimaryButton>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.center}>
        <LoadingState message="Redirecting..." />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorTitle: {
    marginBottom: 8,
    textAlign: "center",
  },
  errorMessage: {
    marginBottom: 24,
    textAlign: "center",
  },
  button: {
    minWidth: 200,
  },
});
