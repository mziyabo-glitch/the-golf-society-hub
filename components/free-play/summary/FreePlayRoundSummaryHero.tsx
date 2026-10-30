import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type FreePlayRoundSummaryHeroProps = {
  courseName: string;
  teeName: string;
  formatLabel: string;
  dateLabel: string;
  winnerName: string | null;
  winnerScoreLabel: string;
  playersCount: number;
  holesCompletedLabel: string;
};

export function FreePlayRoundSummaryHero({
  courseName,
  teeName,
  formatLabel,
  dateLabel,
  winnerName,
  winnerScoreLabel,
  playersCount,
  holesCompletedLabel,
}: FreePlayRoundSummaryHeroProps) {
  const colors = getColors();

  return (
    <View
      style={[
        styles.card,
        { borderColor: freePlayPremium.accentDeepGreen + "40", backgroundColor: freePlayPremium.creamSurface },
        freePlayPremium.heroShadow,
      ]}
    >
      <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 1.1 }}>
        ROUND COMPLETE
      </AppText>
      <AppText variant="h1" style={{ marginTop: spacing.xs }}>
        {courseName}
      </AppText>
      <AppText variant="bodyBold" color="secondary" style={{ marginTop: spacing.xs }}>
        {teeName} · {formatLabel}
      </AppText>
      <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.xs }}>
        {dateLabel}
      </AppText>

      <View style={[styles.winnerWrap, { borderColor: colors.primary + "55", backgroundColor: colors.surface, marginTop: spacing.md }]}>
        <AppText variant="captionBold" color="muted">
          Winner
        </AppText>
        <AppText variant="h2" style={{ marginTop: 4 }}>
          {winnerName || "TBC"}
        </AppText>
        <AppText variant="bodyBold" color="primary" style={{ marginTop: 4 }}>
          {winnerScoreLabel}
        </AppText>
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.metaChip, { borderColor: colors.borderLight }]}>
          <AppText variant="caption" color="secondary">
            Players {playersCount}
          </AppText>
        </View>
        <View style={[styles.metaChip, { borderColor: colors.borderLight }]}>
          <AppText variant="caption" color="secondary">
            {holesCompletedLabel}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.base,
    borderWidth: 1,
    borderRadius: freePlayPremium.heroRadius,
    padding: spacing.base,
  },
  winnerWrap: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  metaRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  metaChip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
});
