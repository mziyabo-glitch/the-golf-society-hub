/**
 * Full-screen upgrade path for premium scoring (tab gate); rest of the app stays reachable via tabs/back.
 */

import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { goBack } from "@/lib/navigation";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { useBootstrap } from "@/lib/useBootstrap";

export default function PremiumScoringScreen() {
  const router = useRouter();
  const colors = getColors();
  const { society } = useBootstrap();

  return (
    <Screen style={{ backgroundColor: colors.backgroundSecondary }}>
      <View style={styles.header}>
        <SecondaryButton size="sm" label="Back" onPress={() => goBack(router)} />
      </View>
      <View style={styles.body}>
        <View style={[styles.heroIcon, { backgroundColor: `${colors.primary}18` }]}>
          <Feather name="edit-3" size={36} color={colors.primary} />
        </View>
        <AppText variant="h1" style={styles.title}>
          Unlock live scoring
        </AppText>
        <AppText variant="body" color="secondary" style={styles.lead}>
          Matchday scorecards, gross entry, and publish flow are a premium society feature. Get a seat to enter rounds
          on the day and keep results official.
        </AppText>
        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="muted" style={{ marginBottom: spacing.xs }}>
            Your society
          </AppText>
          <AppText variant="bodyBold">{society?.name?.trim() || "Current society"}</AppText>
        </AppCard>
        <PrimaryButton label="View billing & seats" onPress={() => router.push("/(app)/billing" as never)} />
        <AppText variant="small" color="muted" style={{ marginTop: spacing.md, textAlign: "center" }}>
          Captains can assign seats from Billing. You can still use Home, Events, OOM, and More without upgrading.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    alignItems: "stretch",
    maxWidth: 440,
    width: "100%",
    alignSelf: "center",
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  lead: {
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  card: {
    marginBottom: spacing.lg,
    padding: spacing.base,
  },
});
