import { ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import type { HourlyForecastPoint } from "@/lib/playability/types";
import { getColors, spacing, radius } from "@/lib/ui/theme";

function hourLabel(time: string): string {
  const m = time.match(/T(\d{2}):(\d{2})/) || time.match(/\s(\d{2}):(\d{2})/);
  if (!m) return "—";
  const h = Number(m[1]);
  const mm = m[2];
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${mm}${ampm}`;
}

type Props = {
  hours: HourlyForecastPoint[];
  title?: string;
};

export function HourlyForecastStrip({ hours, title = "Daylight hours" }: Props) {
  const colors = getColors();
  if (hours.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <AppText variant="captionBold" color="secondary" style={styles.sectionTitle}>
        {title}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {hours.map((h, i) => (
          <View
            key={`${h.time}-${i}`}
            style={[
              styles.cell,
              { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
            ]}
          >
            <AppText variant="captionBold" color="primary" style={styles.time}>
              {hourLabel(h.time)}
            </AppText>
            <AppText variant="small" color="secondary" style={styles.temp}>
              {Math.round(h.tempC)}°
            </AppText>
            <AppText variant="small" color="tertiary" numberOfLines={1}>
              {h.precipProbPercent}%
            </AppText>
            <AppText variant="small" color="tertiary" numberOfLines={1}>
              {Math.round(h.windKmh)} km/h
            </AppText>
          </View>
        ))}
      </ScrollView>
      <AppText variant="small" color="tertiary" style={styles.legend}>
        Rain chance · Wind
      </AppText>
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
  scroll: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  cell: {
    width: 76,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  time: {
    marginBottom: 4,
  },
  temp: {
    fontVariant: ["tabular-nums"],
    marginBottom: 2,
  },
  legend: {
    marginTop: spacing.xs,
  },
});
