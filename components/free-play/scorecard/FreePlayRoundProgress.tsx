import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type FreePlayRoundProgressProps = {
  currentHole: number;
  maxHole: number;
};

export function FreePlayRoundProgress({ currentHole, maxHole }: FreePlayRoundProgressProps) {
  const colors = getColors();
  const pct = maxHole > 0 ? Math.min(1, Math.max(0, currentHole / maxHole)) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.labels}>
        <AppText variant="caption" color="tertiary">
          Round progress
        </AppText>
        <AppText variant="captionBold" color="secondary">
          {currentHole} / {maxHole}
        </AppText>
      </View>
      <View style={[styles.track, { backgroundColor: colors.borderLight }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: colors.primary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  track: {
    height: 6,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  fill: {
    height: 6,
    borderRadius: radius.sm,
  },
});
