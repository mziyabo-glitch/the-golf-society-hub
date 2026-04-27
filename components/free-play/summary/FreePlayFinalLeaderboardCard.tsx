import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type FreePlayFinalLeaderboardRow = {
  position: number;
  playerName: string;
  summary: string;
  detail?: string | null;
  isWinner?: boolean;
};

export type FreePlayFinalLeaderboardCardProps = {
  rows: FreePlayFinalLeaderboardRow[];
};

export function FreePlayFinalLeaderboardCard({ rows }: FreePlayFinalLeaderboardCardProps) {
  const colors = getColors();

  return (
    <View
      style={[
        styles.card,
        { borderColor: freePlayPremium.accentNavy + "33", backgroundColor: colors.surface },
        freePlayPremium.cardShadow,
      ]}
    >
      <AppText variant="h2">Final leaderboard</AppText>
      <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
        How the round finished.
      </AppText>

      {rows.map((row, idx) => (
        <View
          key={`${row.playerName}-${idx}`}
          style={[
            styles.row,
            {
              borderColor: row.isWinner ? colors.primary + "44" : colors.borderLight,
              backgroundColor: row.isWinner ? `${colors.primary}0d` : colors.surface,
            },
          ]}
        >
          <View style={[styles.rankPill, { borderColor: row.isWinner ? colors.primary : colors.borderLight }]}>
            <AppText variant="captionBold" color={row.isWinner ? "primary" : "secondary"}>
              {row.position}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">{row.playerName}</AppText>
            <AppText variant="small" color={row.isWinner ? "primary" : "secondary"} style={{ marginTop: 4 }}>
              {row.summary}
            </AppText>
            {row.detail ? (
              <AppText variant="caption" color="tertiary" style={{ marginTop: 2 }}>
                {row.detail}
              </AppText>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: freePlayPremium.cardRadius,
    padding: spacing.base,
  },
  row: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  rankPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
