/**
 * Deep Link Invite Handler
 * Route: golfsocietypro://sinbook/invite/:id
 * Auto-accepts invite and redirects to the rivalry.
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { acceptInviteByLink } from "@/lib/db_supabase/sinbookRepo";
import { getColors, spacing } from "@/lib/ui/theme";

export default function SinbookInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const sinbookId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { member, userId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (bootstrapLoading || !userId || !sinbookId) return;

    const accept = async () => {
      try {
        const displayName = member?.displayName || member?.name || "Player";
        await acceptInviteByLink(sinbookId, displayName);
        setStatus("success");
        // Navigate to the rivalry after a brief delay
        setTimeout(() => {
          router.replace({ pathname: "/(app)/sinbook/[id]", params: { id: sinbookId } });
        }, 800);
      } catch (err: any) {
        console.error("[sinbook invite] error:", err);
        setErrorMsg(err?.message || "Failed to join rivalry.");
        setStatus("error");
      }
    };

    accept();
  }, [bootstrapLoading, userId, sinbookId]);

  if (bootstrapLoading || status === "loading") {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Joining rivalry..." />
        </View>
      </Screen>
    );
  }

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

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.xs },
});
