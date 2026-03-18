/**
 * Society Invite Handler (captain's link)
 *
 * URL: /invite/:code  (code = society join code)
 *
 * Flow:
 *   1. If user has a session → redirect to onboarding with code + invite=1 (extended form)
 *   2. If no session → store code, show auth overlay (layout handles this)
 *      After login → layout resumes via consumePendingSocietyJoinCode → onboarding with invite=1
 */

import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LoadingState } from "@/components/ui/LoadingState";
import { View, StyleSheet } from "react-native";
import { useBootstrap } from "@/lib/useBootstrap";
import { storePendingSocietyJoinCode } from "@/lib/pendingSocietyJoinCode";
import { getColors } from "@/lib/ui/theme";

function normalizeCode(raw: string | string[] | undefined): string {
  if (!raw) return "";
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s || "").trim().toUpperCase();
}

export default function SocietyInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code: string }>();
  const code = normalizeCode(params.code);
  const { loading: bootstrapLoading, isSignedIn } = useBootstrap();

  useEffect(() => {
    if (bootstrapLoading || !code) return;

    if (isSignedIn) {
      router.replace({ pathname: "/onboarding", params: { mode: "join", code, invite: "1" } });
      return;
    }

    storePendingSocietyJoinCode(code);
  }, [bootstrapLoading, isSignedIn, code, router]);

  const colors = getColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LoadingState message="Loading invite..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
