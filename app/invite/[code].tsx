/**
 * Invite handler: society join code OR event RSVP (UUID).
 *
 * - /invite/{uuid}  → public event RSVP (no sign-in required for guests).
 * - /invite/{code}  → society join (captain link); auth + onboarding.
 */

import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LoadingState } from "@/components/ui/LoadingState";
import { View, StyleSheet } from "react-native";
import { useBootstrap } from "@/lib/useBootstrap";
import { storePendingSocietyJoinCode } from "@/lib/pendingSocietyJoinCode";
import { getColors } from "@/lib/ui/theme";
import { isEventInviteUuid } from "@/lib/eventInviteLink";
import { EventRsvpInviteScreen } from "./EventRsvpInviteScreen";

function normalizeCode(raw: string | string[] | undefined): string {
  if (!raw) return "";
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s || "").trim().toUpperCase();
}

export default function SocietyInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code: string }>();
  const rawSegment = Array.isArray(params.code) ? params.code[0] : params.code;
  const trimmed = String(rawSegment || "").trim();
  const isEventInvite = isEventInviteUuid(trimmed);

  const code = normalizeCode(params.code);
  const { loading: bootstrapLoading, isSignedIn } = useBootstrap();

  useEffect(() => {
    if (isEventInvite) return;
    if (bootstrapLoading || !code) return;

    if (isSignedIn) {
      router.replace({ pathname: "/onboarding", params: { mode: "join", code, invite: "1" } });
      return;
    }

    storePendingSocietyJoinCode(code);
  }, [isEventInvite, bootstrapLoading, isSignedIn, code, router]);

  if (isEventInvite) {
    return <EventRsvpInviteScreen eventId={trimmed} />;
  }

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
