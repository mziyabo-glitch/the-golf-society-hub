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
  /** When set, thru column shows `n/total` and marks incomplete rounds. */
  expectedHoles?: number;
  /** Limit visible rows (e.g. sticky top 3). */
  maxRows?: number;
  /** Compact spacing for sticky bottom placement. */
  compact?: boolean;
  /** Hide CTA line when used as sticky preview. */
  hideCta?: boolean;
};

export function FreePlayLeaderboardPreview({
  format,
  rows,
  onPressOpenFull,
  expectedHoles,
  maxRows,
  compact,
  hideCta,
}: FreePlayLeaderboardPreviewProps) {
  const colors = getColors();
  const list = rows.slice(0, maxRows != null ? maxRows : 3);
  const thruCell = (thru: number) => {
    if (expectedHoles != null && expectedHoles > 0) {
      const incomplete = thru < expectedHoles && thru > 0;
      return `${thru}/${expectedHoles}${incomplete ? "*" : ""}`;
    }
    return String(thru);
  };

  return (
    <Pressable
      onPress={onPressOpenFull}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: freePlayPremium.accentDeepGreen + "44",
          backgroundColor: compact ? freePlayPremium.creamSurface : colors.surface,
          opacity: pressed ? 0.92 : 1,
        },
        compact ? styles.cardCompact : null,
        freePlayPremium.cardShadow,
      ]}
    >
      <View style={styles.headRow}>
        <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 0.8 }}>
          LIVE LEADERBOARD
        </AppText>
        <Feather name="chevron-right" size={18} color={colors.primary} />
      </View>
      {list.length === 0 ? (
        <AppText variant="small" color="secondary">
          No players yet.
        </AppText>
      ) : null}
      {list.map((row, idx) => (
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
            thru {thruCell(row.thru)}
          </AppText>
        </View>
      ))}
      {!hideCta ? (
        <AppText variant="captionBold" color="primary" style={{ marginTop: spacing.md }}>
          View full leaderboard
        </AppText>
      ) : null}
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
  cardCompact: {
    marginTop: 0,
    borderRadius: radius.lg,
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
