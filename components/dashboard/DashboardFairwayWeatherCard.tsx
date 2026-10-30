/**
 * Compact Fairway Weather entry — course + date from next event, CTA opens their site.
 * No in-app weather; summary copy is contextual only.
 */

import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import { getColors, spacing } from "@/lib/ui/theme";
import { dashboardShell } from "./dashboardCardStyles";

function playabilityHint(nextEvent: EventDoc | null): string {
  if (!nextEvent) {
    return "Course-level forecasts and playability — search any venue on Fairway Weather.";
  }
  if (nextEvent.teeTimePublishedAt) {
    return "Tee time set — check wind, rain, and playability for your slot.";
  }
  return "See wind, rain, and the playability outlook for this round.";
}

type Props = {
  nextEvent: EventDoc | null;
  formatEventDate: (dateStr?: string) => string;
  onOpenForecast: () => void;
};

export function DashboardFairwayWeatherCard({
  nextEvent,
  formatEventDate,
  onOpenForecast,
}: Props) {
  const colors = getColors();
  const courseLabel = nextEvent?.courseName?.trim()
    ? String(nextEvent.courseName)
    : "Course to be confirmed";
  const dateLabel = nextEvent ? formatEventDate(nextEvent.date) : "No upcoming event";
  const hint = playabilityHint(nextEvent);

  return (
    <Pressable
      onPress={onOpenForecast}
      accessibilityRole="button"
      accessibilityLabel="View full forecast in Fairway Weather"
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <View
        style={[
          dashboardShell.card,
          { borderColor: colors.borderLight, backgroundColor: colors.surface },
        ]}
      >
        <View style={dashboardShell.sectionEyebrow}>
          <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}12` }]}>
            <Feather name="cloud" size={14} color={colors.primary} />
          </View>
          <AppText variant="captionBold" color="primary" numberOfLines={1}>
            Fairway Weather
          </AppText>
        </View>

        <AppText variant="bodyBold" style={styles.course} numberOfLines={2}>
          {courseLabel}
        </AppText>
        <AppText variant="small" color="secondary" style={styles.dateRow} numberOfLines={1}>
          {dateLabel}
        </AppText>
        <AppText variant="caption" color="tertiary" style={styles.hint} numberOfLines={3}>
          {hint}
        </AppText>

        <View style={[styles.ctaRow, { borderTopColor: colors.borderLight }]}>
          <AppText variant="captionBold" color="primary">
            View Full Forecast
          </AppText>
          <Feather name="external-link" size={14} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  course: {
    marginTop: 2,
  },
  dateRow: {
    marginTop: 4,
  },
  hint: {
    marginTop: spacing.sm,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
});
