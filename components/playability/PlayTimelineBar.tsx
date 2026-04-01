import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import type { HourlyForecastPoint, PlayTimelineSlot } from "@/lib/playability/types";
import { buildSparseTimelineFromHours } from "@/lib/playability/weatherVisual";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type Props = {
  slots: PlayTimelineSlot[];
  /** Used when `slots` is sparse (e.g. first load). */
  fallbackHours?: HourlyForecastPoint[];
};

/**
 * When to play: fixed clock slots + emoji conditions (quick scan).
 */
export function PlayTimelineBar({ slots, fallbackHours = [] }: Props) {
  const colors = getColors();
  const display =
    slots.length >= 2 ? slots : buildSparseTimelineFromHours(fallbackHours);
  if (display.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <AppText variant="captionBold" color="secondary" style={styles.sectionTitle}>
        When to play
      </AppText>
      <View style={[styles.bar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        {display.map((s, i) => (
          <View
            key={`${s.timeLabel}-${i}`}
            style={[
              styles.slot,
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.borderLight },
            ]}
          >
            <AppText style={styles.emoji} accessibilityLabel={`${s.timeLabel} conditions`}>
              {s.emoji}
            </AppText>
            <AppText variant="captionBold" color="primary" style={styles.time}>
              {s.timeLabel}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontSize: 11,
  },
  bar: {
    flexDirection: "row",
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  slot: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    minWidth: 0,
  },
  emoji: {
    fontSize: 26,
    lineHeight: 32,
    marginBottom: 2,
  },
  time: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
});
