import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";

export type FreePlayHoleHeroProps = {
  holeNumber: number;
  par: number;
  strokeIndex: number | null;
  strokeIndexUnavailable: boolean;
  yardageLabel: string | null;
  stablefordActive: boolean;
};

export function FreePlayHoleHero({
  holeNumber,
  par,
  strokeIndex,
  strokeIndexUnavailable,
  yardageLabel,
  stablefordActive,
}: FreePlayHoleHeroProps) {
  const colors = getColors();
  const dist = yardageLabel ? ` · ${yardageLabel}` : "";

  return (
    <View style={[styles.card, { borderColor: freePlayPremium.accentDeepGreen + "44", backgroundColor: freePlayPremium.creamSurface }]}>
      <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 1.2 }}>
        HOLE {holeNumber}
      </AppText>
      <AppText variant="h1" style={{ marginTop: spacing.xs }}>
        Par {par}
        {strokeIndexUnavailable || strokeIndex == null ? "" : ` · SI ${strokeIndex}`}
        {dist}
      </AppText>
      {strokeIndexUnavailable || strokeIndex == null ? (
        <View style={{ marginTop: spacing.md }}>
          <AppText variant="bodyBold" color="warning">
            Stroke index unavailable
          </AppText>
          <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
            Stableford points may be limited for this hole.
          </AppText>
        </View>
      ) : (
        <AppText variant="small" color="secondary" style={{ marginTop: spacing.md }}>
          Stroke Index {strokeIndex}
        </AppText>
      )}
      {stablefordActive ? (
        <View style={[styles.pill, { borderColor: colors.primary + "55", marginTop: spacing.sm }]}>
          <AppText variant="captionBold" color="primary">
            Stableford scoring active
          </AppText>
        </View>
      ) : (
        <View style={[styles.pill, { borderColor: colors.borderLight, marginTop: spacing.sm }]}>
          <AppText variant="captionBold" color="secondary">
            Stroke play (net)
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: freePlayPremium.heroRadius,
    padding: spacing.base,
  },
  pill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
});
