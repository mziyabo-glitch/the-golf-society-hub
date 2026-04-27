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
      <AppText variant="captionBold" color="secondary" numberOfLines={1}>
        {courseName}
      </AppText>
      <AppText variant="bodyBold" style={{ marginTop: 4 }}>
        Hole {currentHole} of {maxHole}
      </AppText>
      <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
        Par {par} · {siText} · {teeName}
      </AppText>
      <View style={[styles.formatPill, { borderColor: colors.primary + "55", marginTop: spacing.sm }]}>
        <AppText variant="captionBold" color="primary">
          {scoringFormatLabel}
        </AppText>
      </View>
      {leaderLine ? (
        <AppText variant="captionBold" color="secondary" style={{ marginTop: spacing.sm }} numberOfLines={2}>
          {leaderLine}
        </AppText>
      ) : null}
      {currentPlayerLine ? (
        <AppText variant="captionBold" color="primary" style={{ marginTop: 4 }} numberOfLines={2}>
          {currentPlayerLine}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  formatPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
});
