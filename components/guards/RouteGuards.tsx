import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { usePathname, useRouter } from "expo-router";

import { useBootstrap } from "@/lib/useBootstrap";
import { LoadingState } from "@/components/ui/LoadingState";
import { getColors } from "@/lib/ui/theme";

type GuardProps = {
  children: React.ReactNode;
};

function GuardFallback({ message }: { message: string }) {
  const colors = getColors();
  return (
    <View style={[styles.fallback, { backgroundColor: colors.background }]}>
      <LoadingState message={message} />
    </View>
  );
}

function useRedirectOnce(resetKey?: string) {
  const redirectedRef = useRef(false);

  useEffect(() => {
    redirectedRef.current = false;
  }, [resetKey]);

  const markRedirected = useCallback(() => {
    redirectedRef.current = true;
  }, []);

  const canRedirect = useCallback(() => !redirectedRef.current, []);

  return { markRedirected, canRedirect };
}

export function RequireAuth({ children }: GuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { bootstrapped, isSignedIn } = useBootstrap();
  const { markRedirected, canRedirect } = useRedirectOnce(pathname);

  useEffect(() => {
    if (!bootstrapped) return;
    if (!isSignedIn && canRedirect()) {
      markRedirected();
      if (pathname !== "/(auth)/sign-in") {
        router.replace("/(auth)/sign-in");
      }
    }
  }, [bootstrapped, isSignedIn, pathname, router, canRedirect, markRedirected]);

  if (!bootstrapped) return <GuardFallback message="Restoring session..." />;
  if (!isSignedIn) return <GuardFallback message="Redirecting to sign in..." />;

  return <>{children}</>;
}

export function RequireSociety({ children }: GuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { bootstrapped, activeSocietyId, isSignedIn } = useBootstrap();
  const { markRedirected, canRedirect } = useRedirectOnce(pathname);

  useEffect(() => {
    if (!bootstrapped) return;
    if (!isSignedIn && canRedirect()) {
      markRedirected();
      router.replace("/(auth)/sign-in");
      return;
    }
    if (isSignedIn && !activeSocietyId && canRedirect()) {
      markRedirected();
      if (pathname !== "/(auth)/join") {
        router.replace("/(auth)/join");
      }
    }
  }, [
    activeSocietyId,
    bootstrapped,
    isSignedIn,
    pathname,
    router,
    canRedirect,
    markRedirected,
  ]);

  if (!bootstrapped) return <GuardFallback message="Restoring session..." />;
  if (!isSignedIn) return <GuardFallback message="Redirecting to sign in..." />;
  if (!activeSocietyId) return <GuardFallback message="Redirecting to onboarding..." />;

  return <>{children}</>;
}

export function RequireNoSociety({ children }: GuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { bootstrapped, activeSocietyId, isSignedIn } = useBootstrap();
  const { markRedirected, canRedirect } = useRedirectOnce(pathname);

  useEffect(() => {
    if (!bootstrapped) return;
    if (!isSignedIn && canRedirect()) {
      markRedirected();
      if (pathname !== "/(auth)/sign-in") {
        router.replace("/(auth)/sign-in");
      }
      return;
    }
    if (activeSocietyId && canRedirect()) {
      markRedirected();
      router.replace("/(app)/society");
    }
  }, [
    activeSocietyId,
    bootstrapped,
    isSignedIn,
    pathname,
    router,
    canRedirect,
    markRedirected,
  ]);

  if (!bootstrapped) return <GuardFallback message="Restoring session..." />;
  if (!isSignedIn) return <GuardFallback message="Redirecting to sign in..." />;
  if (activeSocietyId) return <GuardFallback message="Redirecting to your society..." />;

  return <>{children}</>;
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
