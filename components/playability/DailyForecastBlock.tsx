import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import type { DailyForecastPoint } from "@/lib/playability/types";
import { dailyOutlookEmoji, dailyOutlookTags } from "@/lib/playability/weatherVisual";
import { getColors, spacing, radius } from "@/lib/ui/theme";

function formatDay(ymd: string): string {
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return ymd;
  }
}

type Props = {
  days: DailyForecastPoint[];
  title?: string;
};

export function DailyForecastBlock({ days, title = "Next days" }: Props) {
  const colors = getColors();
  if (days.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <AppText variant="captionBold" color="secondary" style={styles.sectionTitle}>
        {title}
      </AppText>
      <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        {days.map((d, i) => {
          const emoji = dailyOutlookEmoji(d);
          const { rain, wind } = dailyOutlookTags(d);
          return (
            <View
              key={d.dateYmd}
              style={[
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
              ]}
            >
              <AppText style={styles.dayEmoji} accessibilityLabel="Day outlook">
                {emoji}
              </AppText>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="captionBold" color="primary">
                  {formatDay(d.dateYmd)}
                </AppText>
                <View style={styles.tagRow}>
                  <View style={[styles.tag, { backgroundColor: colors.backgroundSecondary, borderColor: colors.borderLight }]}>
                    <AppText variant="captionBold" color="secondary" numberOfLines={1}>
                      {rain}
                    </AppText>
                  </View>
                  <View style={[styles.tag, { backgroundColor: colors.backgroundSecondary, borderColor: colors.borderLight }]}>
                    <AppText variant="captionBold" color="secondary" numberOfLines={1}>
                      {wind}
                    </AppText>
                  </View>
                </View>
              </View>
              <AppText variant="captionBold" color="secondary" style={styles.temp}>
                {Math.round(d.tempMinC)}–{Math.round(d.tempMaxC)}°
              </AppText>
            </View>
          );
        })}
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
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  dayEmoji: {
    fontSize: 28,
    lineHeight: 34,
    width: 36,
    textAlign: "center",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  tag: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  temp: {
    fontVariant: ["tabular-nums"],
    minWidth: 52,
    textAlign: "right",
  },
});
