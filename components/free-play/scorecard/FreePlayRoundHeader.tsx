import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";

export type FreePlayRoundHeaderProps = {
  courseName: string;
  currentHole: number;
  maxHole: number;
  par: number;
  strokeIndex: number | null;
  strokeIndexUnavailable: boolean;
  teeName: string;
  /** Stableford | Stroke (net) */
  scoringFormatLabel: string;
  /** Leaderboard leader summary, e.g. "Brian leads · 14 pts · thru 7" */
  leaderLine: string | null;
  /** Current player running line, e.g. "You · +2 · 12 pts" */
  currentPlayerLine: string | null;
};

export function FreePlayRoundHeader({
  courseName,
  currentHole,
  maxHole,
  par,
  strokeIndex,
  strokeIndexUnavailable,
  teeName,
  scoringFormatLabel,
  leaderLine,
  currentPlayerLine,
}: FreePlayRoundHeaderProps) {
  const colors = getColors();
  const siText = strokeIndexUnavailable ? "SI —" : strokeIndex != null ? `SI ${strokeIndex}` : "SI —";

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.surface, borderBottomColor: colors.borderLight },
        freePlayPremium.cardShadow,
      ]}
    >
      <View style={styles.topRow}>
        <AppText variant="captionBold" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {courseName}
        </AppText>
        <View style={[styles.livePill, { borderColor: colors.success + "66", backgroundColor: `${colors.success}12` }]}>
          <AppText variant="captionBold" color="success">
            Live round
          </AppText>
        </View>
      </View>
      <View style={[styles.metaRow, { marginTop: spacing.xs }]}>
        <AppText variant="bodyBold">Hole {currentHole} of {maxHole}</AppText>
        <View style={[styles.formatPill, { borderColor: colors.primary + "55" }]}>
          <AppText variant="captionBold" color="primary">
            {scoringFormatLabel}
          </AppText>
        </View>
      </View>
      <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
        Par {par} · {siText} · {teeName}
      </AppText>
      {leaderLine ? (
        <View style={[styles.energyLine, { borderColor: colors.borderLight }]}>
          <AppText variant="captionBold" color="secondary" numberOfLines={2}>
            {leaderLine}
          </AppText>
        </View>
      ) : null}
      {currentPlayerLine ? (
        <View style={[styles.energyLine, { borderColor: colors.primary + "55", backgroundColor: `${colors.primary}0f` }]}>
          <AppText variant="captionBold" color="primary" numberOfLines={2}>
            {currentPlayerLine}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  formatPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  livePill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  energyLine: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
