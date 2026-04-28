import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";
import type { FreePlayLeaderboardRow } from "@/lib/scoring/freePlayScoring";
import type { FreePlayScoringFormat } from "@/types/freePlayScorecard";

export type FreePlayLeaderboardPreviewProps = {
  format: FreePlayScoringFormat;
  rows: FreePlayLeaderboardRow[];
  onPressOpenFull: () => void;
};

export function FreePlayLeaderboardPreview({ format, rows, onPressOpenFull }: FreePlayLeaderboardPreviewProps) {
  const colors = getColors();
  const hasScores = rows.some((r) => r.thru > 0);

  if (!hasScores) {
    return (
      <View
        style={[
          styles.card,
          { borderColor: colors.borderLight, backgroundColor: freePlayPremium.creamSurface },
          freePlayPremium.cardShadow,
        ]}
      >
        <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 0.8 }}>
          LIVE LEADERBOARD
        </AppText>
        <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
          Leaderboard starts after the first score.
        </AppText>
      </View>
    );
  }

  const top = rows.slice(0, 3);

  return (
    <Pressable
      onPress={onPressOpenFull}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: freePlayPremium.accentDeepGreen + "44",
          backgroundColor: colors.surface,
          opacity: pressed ? 0.92 : 1,
        },
        freePlayPremium.cardShadow,
      ]}
    >
      <View style={styles.headRow}>
        <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 0.8 }}>
          LIVE LEADERBOARD
        </AppText>
        <Feather name="chevron-right" size={18} color={colors.primary} />
      </View>
      {top.map((row, idx) => (
        <View
          key={row.roundPlayerId}
          style={[
            styles.row,
            {
              borderBottomColor: colors.borderLight,
              backgroundColor: idx === 0 ? `${freePlayPremium.accentDeepGreen}10` : "transparent",
              borderRadius: idx === 0 ? radius.md : 0,
              paddingHorizontal: idx === 0 ? spacing.xs : 0,
            },
          ]}
        >
          <AppText variant="captionBold" color="secondary" style={styles.rank}>
            {idx + 1}
          </AppText>
          <AppText variant="bodyBold" style={styles.name} numberOfLines={1}>
            {row.displayName}
          </AppText>
          <AppText variant="bodyBold" color="primary" style={styles.value}>
            {format === "stableford" ? `${row.stablefordPoints ?? "—"} pts` : `${row.netTotal ?? "—"}`}
          </AppText>
          <AppText variant="caption" color="tertiary" style={styles.thru}>
            thru {row.thru}
          </AppText>
        </View>
      ))}
      <AppText variant="captionBold" color="primary" style={{ marginTop: spacing.md }}>
        View full leaderboard
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: freePlayPremium.heroRadius,
    padding: spacing.base,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  rank: {
    width: 22,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
  value: {
    minWidth: 56,
    textAlign: "right",
  },
  thru: {
    width: 56,
    textAlign: "right",
  },
});
