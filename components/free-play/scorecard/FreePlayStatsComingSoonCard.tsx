import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";

export function FreePlayStatsComingSoonCard() {
  const colors = getColors();

  return (
    <View
      style={[
        styles.card,
        { borderColor: freePlayPremium.accentNavy + "33", backgroundColor: freePlayPremium.creamSurface },
        freePlayPremium.cardShadow,
      ]}
    >
      <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 0.8 }}>
        STATS
      </AppText>
      <AppText variant="h2" style={{ marginTop: spacing.sm }}>
        Stats scoring coming soon
      </AppText>
      <AppText variant="small" color="secondary" style={{ marginTop: spacing.md }}>
        Soon you will be able to track:
      </AppText>
      <AppText variant="bodyBold" style={{ marginTop: spacing.sm, lineHeight: 24 }}>
        Fairways · GIR · Putts · Penalties · Sand saves
      </AppText>
      <View style={[styles.note, { borderTopColor: colors.borderLight }]}>
        <AppText variant="caption" color="tertiary">
          Simple scoring is active for this round.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: freePlayPremium.heroRadius,
    padding: spacing.base,
  },
  note: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
