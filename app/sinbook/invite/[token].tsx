/**
 * Sinbook Invite Handler (top-level — outside auth guard)
 *
 * URL: /sinbook/invite/:token  (token = sinbook ID)
 *
 * Flow:
 *   1. If user has a session + society → accept invite, redirect to rivalry
 *   2. If no session → store token, redirect to /onboarding
 *      After login, onboarding completes → root layout resumes invite via stored token
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  getSinbook,
  acceptInviteByLink,
  type SinbookWithParticipants,
} from "@/lib/db_supabase/sinbookRepo";
import {
  storePendingInviteToken,
} from "@/lib/sinbookInviteToken";
import { getColors, spacing } from "@/lib/ui/theme";

export default function SinbookInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const { loading: bootstrapLoading, isSignedIn, activeSocietyId, member } = useBootstrap();
  const colors = getColors();

  const [status, setStatus] = useState<"loading" | "preview" | "accepting" | "done" | "error">("loading");
  const [sinbook, setSinbook] = useState<SinbookWithParticipants | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Step 1: Wait for bootstrap, then decide flow
  useEffect(() => {
    if (bootstrapLoading || !token) return;

    if (!isSignedIn || !activeSocietyId) {
      // No session → store token, send to onboarding
      storePendingInviteToken(token);
      console.log("[sinbook-invite] No session, stored token, redirecting to /onboarding");
      router.replace("/onboarding");
      return;
    }

    // Signed in → load sinbook preview
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapLoading, isSignedIn, activeSocietyId, token]);

  const loadPreview = async () => {
    setStatus("loading");
    try {
      const sb = await getSinbook(token);
      if (!sb) {
        setErrorMsg("This rivalry was not found or has been deleted.");
        setStatus("error");
        return;
      }
      setSinbook(sb);
      setStatus("preview");
    } catch {
      // If RLS blocks (user not a participant yet), show generic accept
      setSinbook(null);
      setStatus("preview");
    }
  };

  const handleAccept = async () => {
    setStatus("accepting");
    try {
      const displayName = member?.displayName || member?.name || "Player";
      await acceptInviteByLink(token, displayName);
      setStatus("done");
      setTimeout(() => {
        router.replace({ pathname: "/(app)/sinbook/[id]", params: { id: token } });
      }, 600);
    } catch (err: any) {
      console.error("[sinbook-invite] accept error:", err);
      setErrorMsg(err?.message || "Failed to join rivalry.");
      setStatus("error");
    }
  };

  const handleDecline = () => {
    router.replace("/(app)/(tabs)/sinbook");
  };

  // Loading
  if (bootstrapLoading || status === "loading") {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading invite..." />
        </View>
      </Screen>
    );
  }

  // Error
  if (status === "error") {
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="alert-circle" size={24} color={colors.error} />}
          title="Couldn't Join"
          message={errorMsg}
          action={{ label: "Go to Sinbook", onPress: () => router.replace("/(app)/(tabs)/sinbook") }}
        />
      </Screen>
    );
  }

  // Accepting
  if (status === "accepting") {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Joining rivalry..." />
        </View>
      </Screen>
    );
  }

  // Done
  if (status === "done") {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <Feather name="check-circle" size={48} color={colors.success} />
          <AppText variant="h2" style={{ marginTop: spacing.sm }}>Joined!</AppText>
          <AppText variant="body" color="secondary">Redirecting to your rivalry...</AppText>
        </View>
      </Screen>
    );
  }

  // Preview / Accept prompt
  const creator = sinbook?.participants.find((p) => p.user_id === sinbook?.created_by);

  return (
    <Screen>
      <View style={styles.centered}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primary + "15" }]}>
          <Feather name="zap" size={32} color={colors.primary} />
        </View>

        <AppText variant="title" style={{ marginTop: spacing.lg, textAlign: "center" }}>
          Rivalry Invite
        </AppText>

        <AppCard style={{ marginTop: spacing.lg, width: "100%" }}>
          {sinbook ? (
            <>
              <AppText variant="h2">{sinbook.title}</AppText>
              {creator && (
                <AppText variant="caption" color="secondary" style={{ marginTop: 2 }}>
                  Created by {creator.display_name}
                </AppText>
              )}
              {sinbook.stake && (
                <AppText variant="body" color="secondary" style={{ marginTop: spacing.xs }}>
                  Stake: {sinbook.stake}
                </AppText>
              )}
            </>
          ) : (
            <AppText variant="body" color="secondary">
              You&apos;ve been invited to join a rivalry on The Golf Society Hub.
            </AppText>
          )}

          <PrimaryButton onPress={handleAccept} style={{ marginTop: spacing.lg }}>
            Accept & Join
          </PrimaryButton>
          <SecondaryButton onPress={handleDecline} style={{ marginTop: spacing.sm }}>
            No Thanks
          </SecondaryButton>
        </AppCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
