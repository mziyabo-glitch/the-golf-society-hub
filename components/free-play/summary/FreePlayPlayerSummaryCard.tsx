import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type FreePlayPlayerSummaryCardProps = {
  playerName: string;
  headline: string;
  splitLine: string | null;
  statsLine: string | null;
  isWinner?: boolean;
};

export function FreePlayPlayerSummaryCard({
  playerName,
  headline,
  splitLine,
  statsLine,
  isWinner,
}: FreePlayPlayerSummaryCardProps) {
  const colors = getColors();

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: isWinner ? colors.primary + "55" : colors.borderLight,
          backgroundColor: isWinner ? `${colors.primary}0d` : colors.surface,
        },
        freePlayPremium.cardShadow,
      ]}
    >
      <View style={styles.headRow}>
        <AppText variant="bodyBold" numberOfLines={1} style={{ flex: 1 }}>
          {playerName}
        </AppText>
        {isWinner ? (
          <View style={[styles.badge, { borderColor: colors.primary + "66", backgroundColor: `${colors.primary}12` }]}>
            <AppText variant="captionBold" color="primary">
              Winner
            </AppText>
          </View>
        ) : null}
      </View>

      <AppText variant="small" color={isWinner ? "primary" : "secondary"} style={{ marginTop: spacing.xs }}>
        {headline}
      </AppText>
      {splitLine ? (
        <AppText variant="caption" color="secondary" style={{ marginTop: spacing.xs }}>
          {splitLine}
        </AppText>
      ) : null}
      {statsLine ? (
        <AppText variant="caption" color="tertiary" style={{ marginTop: 3 }}>
          {statsLine}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: freePlayPremium.cardRadius,
    padding: spacing.sm,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
});
