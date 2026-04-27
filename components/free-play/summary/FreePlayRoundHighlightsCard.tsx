import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type FreePlayRoundHighlight = {
  label: string;
  playerName: string;
  valueLabel: string;
};

export type FreePlayRoundHighlightsCardProps = {
  highlights: FreePlayRoundHighlight[];
};

export function FreePlayRoundHighlightsCard({ highlights }: FreePlayRoundHighlightsCardProps) {
  const colors = getColors();
  if (highlights.length === 0) return null;

  return (
    <View
      style={[
        styles.card,
        { borderColor: freePlayPremium.accentDeepGreen + "33", backgroundColor: freePlayPremium.creamSurface },
        freePlayPremium.cardShadow,
      ]}
    >
      <AppText variant="h2">Round highlights</AppText>
      <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
        Best moments from this round.
      </AppText>

      <View style={{ marginTop: spacing.md }}>
        {highlights.map((h, idx) => (
          <View key={`${h.label}-${idx}`} style={[styles.row, { borderTopColor: idx === 0 ? "transparent" : colors.borderLight }]}>
            <View style={{ flex: 1 }}>
              <AppText variant="captionBold" color="muted">
                {h.label}
              </AppText>
              <AppText variant="bodyBold" style={{ marginTop: 2 }}>
                {h.playerName}
              </AppText>
            </View>
            <View style={[styles.valuePill, { borderColor: colors.borderLight }]}>
              <AppText variant="captionBold" color="primary">
                {h.valueLabel}
              </AppText>
            </View>
          </View>
        ))}
      </View>
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
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  valuePill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
});
