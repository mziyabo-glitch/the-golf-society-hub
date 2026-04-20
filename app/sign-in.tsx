import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthScreen } from "@/components/AuthScreen";
import { storePendingPostAuthRedirect } from "@/lib/pendingPostAuthRedirect";
import { useBootstrap } from "@/lib/useBootstrap";
import { blurWebActiveElement } from "@/lib/ui/focus";

/**
 * Public sign-in route so users can authenticate while keeping a return path
 * (e.g. after RSVP gates on `/invite/{eventUuid}`).
 */
export default function PublicSignInScreen() {
  const router = useRouter();
  const { isSignedIn, authRestoring } = useBootstrap();
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  const nextRaw = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : null;

  useEffect(() => {
    if (next) void storePendingPostAuthRedirect(next);
  }, [next]);

  useEffect(() => {
    if (authRestoring || !isSignedIn) return;
    blurWebActiveElement();
    router.replace((next ?? "/(app)/(tabs)") as never);
  }, [authRestoring, isSignedIn, next, router]);

  return <AuthScreen redirectAfterSignIn={next} />;
}
