import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";

export type FreePlayHoleHeroProps = {
  holeNumber: number;
  maxHoleNumber: number;
  par: number;
  strokeIndex: number | null;
  strokeIndexUnavailable: boolean;
  yardageLabel: string | null;
  stablefordActive: boolean;
  onPrevHole: () => void;
  onNextHole: () => void;
  canPrev: boolean;
  canNext: boolean;
};

export function FreePlayHoleHero({
  holeNumber,
  maxHoleNumber,
  par,
  strokeIndex,
  strokeIndexUnavailable,
  yardageLabel,
  stablefordActive,
  onPrevHole,
  onNextHole,
  canPrev,
  canNext,
}: FreePlayHoleHeroProps) {
  const colors = getColors();
  const siLabel = strokeIndexUnavailable || strokeIndex == null ? "SI -" : `SI ${strokeIndex}`;

  return (
    <View style={[styles.card, { borderColor: freePlayPremium.accentDeepGreen + "44", backgroundColor: freePlayPremium.creamSurface }]}>
      <View style={styles.topRow}>
        <Pressable
          onPress={onPrevHole}
          disabled={!canPrev}
          style={({ pressed }) => [
            styles.navBtn,
            { borderColor: colors.borderLight, opacity: !canPrev ? 0.4 : pressed ? 0.82 : 1 },
          ]}
        >
          <AppText variant="captionBold" color="secondary">
            Prev
          </AppText>
        </Pressable>
        <View style={styles.center}>
          <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 1.1 }}>
            Hole {holeNumber} of {maxHoleNumber}
          </AppText>
          <AppText variant="h1" style={{ marginTop: 2 }}>
            {holeNumber}
          </AppText>
        </View>
        <Pressable
          onPress={onNextHole}
          disabled={!canNext}
          style={({ pressed }) => [
            styles.navBtn,
            { borderColor: colors.borderLight, opacity: !canNext ? 0.4 : pressed ? 0.82 : 1 },
          ]}
        >
          <AppText variant="captionBold" color="secondary">
            Next
          </AppText>
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.pill, { borderColor: colors.borderLight }]}>
          <AppText variant="captionBold" color="secondary">
            Par {par}
          </AppText>
        </View>
        <View style={[styles.pill, { borderColor: strokeIndexUnavailable ? colors.warning + "55" : colors.borderLight }]}>
          <AppText variant="captionBold" color={strokeIndexUnavailable ? "warning" : "secondary"}>
            {siLabel}
          </AppText>
        </View>
        {yardageLabel ? (
          <View style={[styles.pill, { borderColor: colors.borderLight }]}>
            <AppText variant="captionBold" color="secondary">
              {yardageLabel}
            </AppText>
          </View>
        ) : null}
      </View>

      <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
        {stablefordActive ? "Stableford scoring · autosave enabled" : "Stroke net scoring · autosave enabled"}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: freePlayPremium.heroRadius,
    padding: spacing.base,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  center: {
    alignItems: "center",
    flex: 1,
  },
  navBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minWidth: 72,
    alignItems: "center",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  pill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
});
