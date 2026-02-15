import { useCallback, useEffect, useRef, useState } from "react";
import * as Linking from "expo-linking";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { supabase } from "@/lib/supabase";

type CallbackParams = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  error: string | null;
  errorDescription: string | null;
};

type ErrorState = {
  message: string;
  stack: string;
} | null;

function parseAuthCallback(url: string): CallbackParams {
  const queryString = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
  const hashString = url.includes("#") ? url.split("#")[1] : "";
  const queryParams = new URLSearchParams(queryString);
  const hashParams = new URLSearchParams(hashString);
  const getParam = (key: string) => hashParams.get(key) ?? queryParams.get(key);

  return {
    accessToken: getParam("access_token"),
    refreshToken: getParam("refresh_token"),
    code: getParam("code"),
    error: getParam("error"),
    errorDescription: getParam("error_description"),
  };
}

function toErrorState(error: any): ErrorState {
  return {
    message: error?.message || "Authentication callback failed.",
    stack: error?.stack || "No stack trace available.",
  };
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [errorState, setErrorState] = useState<ErrorState>(null);
  const completedRef = useRef(false);
  const seenUrlsRef = useRef<Set<string>>(new Set());

  const handleSuccess = useCallback(
    (source: string) => {
      if (completedRef.current) return;
      completedRef.current = true;
      console.log("[auth/callback] Session established:", source);
      router.replace("/(app)");
    },
    [router]
  );

  const processUrl = useCallback(
    async (url: string, source: string) => {
      if (!url || completedRef.current) return;
      if (seenUrlsRef.current.has(url)) return;
      seenUrlsRef.current.add(url);

      console.log("[auth/callback] URL received:", { source, url });

      try {
        const parsed = parseAuthCallback(url);

        if (parsed.error) {
          throw new Error(parsed.errorDescription || parsed.error);
        }

        if (parsed.accessToken && parsed.refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });
          if (error) throw error;
          handleSuccess("token-session");
          return;
        }

        if (parsed.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (error) throw error;
          handleSuccess("pkce-code");
          return;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session) {
          handleSuccess("existing-session");
          return;
        }

        throw new Error("No callback auth parameters found in URL.");
      } catch (error: any) {
        console.error("[auth/callback] processing error:", error);
        setErrorState(toErrorState(error));
      }
    },
    [handleSuccess]
  );

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[auth/callback] onAuthStateChange:", event);
      if (cancelled) return;
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        handleSuccess(`auth-event:${event}`);
      }
    });

    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void processUrl(url, "link-event");
    });

    async function bootstrap() {
      try {
        const initialUrl = await Linking.getInitialURL();
        console.log("[auth/callback] initial URL:", initialUrl);
        if (initialUrl) {
          await processUrl(initialUrl, "initial-url");
          return;
        }

        if (typeof window !== "undefined") {
          await processUrl(window.location.href, "window-location");
          return;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session) {
          handleSuccess("session-check");
          return;
        }

        throw new Error("No callback URL found.");
      } catch (error: any) {
        console.error("[auth/callback] bootstrap error:", error);
        setErrorState(toErrorState(error));
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
      authSubscription.unsubscribe();
      linkSubscription.remove();
    };
  }, [handleSuccess, processUrl]);

  if (errorState) {
    return (
      <Screen>
        <View style={styles.root}>
          <Text style={styles.errorTitle}>Sign-in callback failed</Text>
          <Text selectable style={styles.errorMessage}>
            {errorState.message}
          </Text>
          <ScrollView style={styles.stackContainer} contentContainerStyle={styles.stackContent}>
            <Text selectable style={styles.stackText}>
              {errorState.stack}
            </Text>
          </ScrollView>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.root}>
        <Text style={styles.loadingText}>Signing you in…</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: "#0f172a",
    fontWeight: "600",
  },
  errorTitle: {
    width: "100%",
    fontSize: 20,
    fontWeight: "700",
    color: "#991b1b",
  },
  errorMessage: {
    width: "100%",
    color: "#7f1d1d",
    fontSize: 14,
  },
  stackContainer: {
    width: "100%",
    maxHeight: 300,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#fecaca",
    borderRadius: 8,
    backgroundColor: "#fff1f2",
  },
  stackContent: {
    padding: 10,
  },
  stackText: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
    color: "#7f1d1d",
  },
});
