import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";
import type { FreePlayLeaderboardRow } from "@/lib/scoring/freePlayScoring";
import type { FreePlayScoringFormat } from "@/types/freePlayScorecard";

type FreePlayMiniLeaderboardProps = {
  rows: FreePlayLeaderboardRow[];
  format: FreePlayScoringFormat;
  expectedHoles: number;
  onPressOpen: () => void;
  relativeToParByPlayerId?: Record<string, string>;
};

export function FreePlayMiniLeaderboard({
  rows,
  format,
  expectedHoles,
  onPressOpen,
  relativeToParByPlayerId,
}: FreePlayMiniLeaderboardProps) {
  const colors = getColors();
  const top = rows.slice(0, 3);

  return (
    <Pressable
      onPress={onPressOpen}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: freePlayPremium.accentDeepGreen + "44",
          backgroundColor: freePlayPremium.creamSurface,
          opacity: pressed ? 0.9 : 1,
        },
        freePlayPremium.cardShadow,
      ]}
    >
      <View style={styles.headRow}>
        <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 0.8 }}>
          LEADERBOARD
        </AppText>
        <Feather name="chevron-up" size={16} color={colors.primary} />
      </View>
      {top.length === 0 ? (
        <AppText variant="small" color="secondary">
          Waiting for first score...
        </AppText>
      ) : null}
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
          <AppText variant="bodyBold" numberOfLines={1} style={styles.name}>
            {row.displayName}
          </AppText>
          <AppText variant="bodyBold" color="primary" style={styles.value}>
            {relativeToParByPlayerId?.[row.roundPlayerId] ?? "—"}
          </AppText>
          {format === "stableford" ? (
            <AppText variant="caption" color="secondary" style={styles.extra}>
              {row.stablefordPoints ?? "—"} pts
            </AppText>
          ) : null}
          <AppText variant="caption" color="tertiary" style={styles.thru}>
            {row.thru}/{expectedHoles}
          </AppText>
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
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
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: { width: 20 },
  name: { flex: 1, minWidth: 0 },
  value: { minWidth: 56, textAlign: "right" },
  extra: { minWidth: 46, textAlign: "right" },
  thru: { width: 44, textAlign: "right" },
});
