import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import type { DailyForecastPoint } from "@/lib/playability/types";
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

export function DailyForecastBlock({ days, title = "Short outlook" }: Props) {
  const colors = getColors();
  if (days.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <AppText variant="captionBold" color="secondary" style={styles.sectionTitle}>
        {title}
      </AppText>
      <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        {days.map((d, i) => (
          <View
            key={d.dateYmd}
            style={[
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="captionBold" color="primary">
                {formatDay(d.dateYmd)}
              </AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: 2 }} numberOfLines={2}>
                {d.summary}
              </AppText>
            </View>
            <View style={styles.metrics}>
              <AppText variant="small" color="secondary" style={styles.metric}>
                {Math.round(d.tempMinC)}–{Math.round(d.tempMaxC)}°
              </AppText>
              <AppText variant="small" color="tertiary" style={styles.metric}>
                Rain {d.precipProbMaxPercent}%
              </AppText>
            </View>
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
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  metrics: {
    alignItems: "flex-end",
    minWidth: 88,
  },
  metric: {
    fontVariant: ["tabular-nums"],
  },
});
