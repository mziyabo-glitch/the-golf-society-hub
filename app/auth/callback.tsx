import { useCallback, useEffect, useRef, useState } from "react";
import * as Linking from "expo-linking";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { PrimaryButton } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { spacing } from "@/lib/ui/theme";

type ParsedAuthCallback = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  error: string | null;
  errorDescription: string | null;
};

function decodeUrlParam(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function parseCallbackUrl(url: string): ParsedAuthCallback {
  const queryPart = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
  const hashPart = url.includes("#") ? url.split("#")[1] : "";

  const queryParams = new URLSearchParams(queryPart);
  const hashParams = new URLSearchParams(hashPart);

  const getParam = (key: string): string | null =>
    hashParams.get(key) ?? queryParams.get(key);

  return {
    accessToken: getParam("access_token"),
    refreshToken: getParam("refresh_token"),
    code: getParam("code"),
    error: getParam("error"),
    errorDescription: decodeUrlParam(getParam("error_description")),
  };
}

function clearCallbackUrlForWeb(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname);
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const handledUrlsRef = useRef<Set<string>>(new Set());
  const completedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const completeSuccess = useCallback(
    (source: string) => {
      if (completedRef.current) return;
      completedRef.current = true;
      console.log("[auth/callback] Session established via:", source);
      clearCallbackUrlForWeb();
      router.replace("/");
    },
    [router]
  );

  const handleCallbackUrl = useCallback(
    async (url: string, source: string) => {
      if (!url || completedRef.current) return;
      if (handledUrlsRef.current.has(url)) return;
      handledUrlsRef.current.add(url);

      console.log("[auth/callback] URL received:", { source, url });

      const parsed = parseCallbackUrl(url);
      if (parsed.error) {
        const message = parsed.errorDescription || parsed.error;
        console.error("[auth/callback] Provider returned error:", message);
        setError(message);
        return;
      }

      try {
        if (parsed.accessToken && parsed.refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });

          if (sessionError) {
            throw sessionError;
          }

          completeSuccess("implicit-tokens");
          return;
        }

        if (parsed.code) {
          const { error: codeError } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (codeError) {
            throw codeError;
          }
          completeSuccess("pkce-code");
          return;
        }

        // If callback URL has no auth params, session may already be set by Supabase.
        const { data, error: getSessionError } = await supabase.auth.getSession();
        if (getSessionError) {
          throw getSessionError;
        }
        if (data.session) {
          completeSuccess("existing-session");
          return;
        }
      } catch (err: any) {
        console.error("[auth/callback] Failed to establish session:", err);
        setError(err?.message || "Could not complete sign-in.");
      }
    },
    [completeSuccess]
  );

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[auth/callback] onAuthStateChange:", event, {
        hasSession: !!session,
      });
      if (cancelled || !session) return;
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        completeSuccess(`auth-event:${event}`);
      }
    });

    const urlSubscription = Linking.addEventListener("url", ({ url }) => {
      void handleCallbackUrl(url, "linking-event");
    });

    async function bootstrapCallbackHandling() {
      try {
        const initialUrl = await Linking.getInitialURL();
        console.log("[auth/callback] initialURL:", initialUrl);
        if (initialUrl) {
          await handleCallbackUrl(initialUrl, "initial-url");
        }

        // Web fallback: ensure full location is processed even if initialURL is null.
        if (!initialUrl && typeof window !== "undefined") {
          await handleCallbackUrl(window.location.href, "window-location");
        }

        if (cancelled || completedRef.current) return;

        const { data, error: getSessionError } = await supabase.auth.getSession();
        if (getSessionError) {
          throw getSessionError;
        }

        if (data.session) {
          completeSuccess("post-check-session");
          return;
        }

        setError("No authentication data found in callback URL.");
      } catch (err: any) {
        console.error("[auth/callback] bootstrap callback handling failed:", err);
        setError(err?.message || "Could not complete sign-in. Please try again.");
      }
    }

    void bootstrapCallbackHandling();
    return () => {
      cancelled = true;
      authSubscription.unsubscribe();
      urlSubscription.remove();
    };
  }, [completeSuccess, handleCallbackUrl]);

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
