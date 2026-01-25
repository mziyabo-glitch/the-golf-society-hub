import React, { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "expo-router";

import { useBootstrap } from "@/lib/useBootstrap";

type GuardProps = {
  children: React.ReactNode;
};

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

  if (!bootstrapped) return null;
  if (!isSignedIn) return null;

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

  if (!bootstrapped) return null;
  if (!isSignedIn) return null;
  if (!activeSocietyId) return null;

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

  if (!bootstrapped) return null;
  if (!isSignedIn) return null;
  if (activeSocietyId) return null;

  return <>{children}</>;
}
