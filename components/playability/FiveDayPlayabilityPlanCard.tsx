/**
 * Read-only 5-day planner UI — data from evaluateFiveDayPlayabilityPlan.
 */

import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import type { NormalizedForecast } from "@/lib/playability/types";
import { mapHourlyForecastPointsToRoundSamples } from "@/lib/playability/playabilityEngine";
import { evaluateFiveDayPlayabilityPlan, type FiveDayPlayabilityPlan } from "@/lib/weather/playabilityPlanner";
import {
  dailySummaryKindHeadline,
  formatFiveDayWeekOutlookLine,
  windowChipShortLabel,
} from "@/lib/weather/playabilityPlannerPresentation";
import { playabilityIcon, type PlayabilityStatus } from "@/lib/weather/playabilityEngine";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  loading: boolean;
  forecast: NormalizedForecast | null;
  /** First plan day YYYY-MM-DD (typically today at venue / device calendar) */
  startDateYmd: string;
  countryCode?: string | null;
};

function statusChipColors(status: PlayabilityStatus, colors: ReturnType<typeof getColors>): { bg: string; fg: string } {
  switch (status) {
    case "PLAY":
      return { bg: `${colors.success}18`, fg: colors.success };
    case "MARGINAL":
      return { bg: `${colors.primary}14`, fg: colors.primary };
    case "CAUTION":
      return { bg: `${colors.warning}18`, fg: colors.warning };
    case "NO_PLAY":
      return { bg: `${colors.error}16`, fg: colors.error };
    default:
      return { bg: colors.backgroundTertiary, fg: colors.textTertiary };
  }
}

export function FiveDayPlayabilityPlanCard({ loading, forecast, startDateYmd, countryCode = "GB" }: Props) {
  const colors = getColors();

  const plan: FiveDayPlayabilityPlan | null = useMemo(() => {
    if (!forecast?.hourly?.length || !/^\d{4}-\d{2}-\d{2}$/.test(startDateYmd.trim())) return null;
    const hourly = mapHourlyForecastPointsToRoundSamples(forecast.hourly);
    const daySunlight = forecast.daily.map((d) => ({
      dateYmd: d.dateYmd,
      sunriseIso: d.sunrise ?? null,
      sunsetIso: d.sunset ?? null,
    }));
    return evaluateFiveDayPlayabilityPlan({
      countryCode,
      startDateYmd: startDateYmd.trim(),
      hourly,
      daySunlight,
    });
  }, [forecast, startDateYmd, countryCode]);

  const weekOutlookLine = useMemo(
    () => (plan?.days.length ? formatFiveDayWeekOutlookLine(plan.days) : ""),
    [plan],
  );

  if (loading) {
    return (
      <AppCard style={[styles.card, { borderColor: colors.borderLight }]}>
        <AppText variant="captionBold" color="secondary">
          5-day planner
        </AppText>
        <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
          Loading outlook…
        </AppText>
      </AppCard>
    );
  }

  if (!plan?.days.length) {
    return (
      <AppCard style={[styles.card, { borderColor: colors.borderLight }]}>
        <AppText variant="captionBold" color="secondary">
          5-day planner
        </AppText>
        <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
          Forecast is not ready for a multi-day plan yet.
        </AppText>
      </AppCard>
    );
  }

  return (
    <AppCard style={[styles.card, { borderColor: colors.borderLight }]}>
      <AppText variant="captionBold" color="primary" style={styles.eyebrow}>
        5-day playability
      </AppText>
      <AppText variant="small" color="secondary" style={{ marginBottom: spacing.xs }}>
        Four-hour looks (06–10, 10–14, 14–18, local). A block only hides if it cannot overlap golf daylight once we have
        sunrise and sunset — sparse winter data still shows up for a fair read.
      </AppText>
      <AppText variant="captionBold" color="primary" style={{ marginBottom: spacing.md, lineHeight: 18 }}>
        {weekOutlookLine}
      </AppText>

      {plan.days.map((day, index) => {
        const dayTone = statusChipColors(day.overallStatus, colors);
        const kindHead = dailySummaryKindHeadline(day.dailySummaryKind);
        return (
          <View
            key={day.date}
            style={[
              styles.dayBlock,
              { borderTopColor: colors.borderLight },
              index === 0 && styles.dayBlockFirst,
            ]}
          >
            <View style={styles.dayHeader}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{day.dayLabel}</AppText>
                <AppText variant="caption" color="tertiary">
                  {day.date}
                </AppText>
              </View>
              <View style={[styles.pill, { backgroundColor: dayTone.bg }]}>
                <AppText variant="captionBold" style={{ color: dayTone.fg }}>
                  {kindHead}
                </AppText>
              </View>
            </View>

            {day.bestWindow ? (
              <View
                style={[
                  styles.bestWindowBand,
                  {
                    marginTop: spacing.md,
                    backgroundColor: `${colors.primary}10`,
                    borderLeftColor: colors.primary,
                  },
                ]}
              >
                <AppText variant="captionBold" color="primary" style={styles.bestWindowEyebrow} numberOfLines={1}>
                  Best window
                </AppText>
                <AppText variant="subheading" color="primary" style={styles.bestWindowTime} numberOfLines={1}>
                  {day.bestWindow}
                </AppText>
              </View>
            ) : day.windows.length > 0 ? (
              <View
                style={[
                  styles.bestWindowBand,
                  {
                    marginTop: spacing.md,
                    backgroundColor: colors.backgroundSecondary,
                    borderLeftColor: colors.border,
                  },
                ]}
              >
                <AppText variant="captionBold" color="secondary" numberOfLines={2}>
                  Best window · still open — no single block pulls ahead yet.
                </AppText>
              </View>
            ) : null}

            <View style={styles.summaryRow}>
              <Feather name={playabilityIcon(day.overallStatus) as keyof typeof Feather.glyphMap} size={17} color={dayTone.fg} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <AppText variant="small" color="secondary" style={styles.summaryBody} numberOfLines={4}>
                  {day.summaryMessage}
                </AppText>
              </View>
            </View>

            {day.windows.length > 0 ? (
              <View style={styles.chipSection}>
                <AppText variant="caption" color="tertiary" style={styles.chipSectionLabel}>
                  Four-hour blocks
                </AppText>
                <View style={styles.chipRow}>
                  {day.windows.map((w) => {
                    const c = statusChipColors(w.status, colors);
                    const short = windowChipShortLabel(w.startHour, w.endHour);
                    return (
                      <View
                        key={`${day.date}-${w.startHour}`}
                        style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
                      >
                        <AppText variant="captionBold" numberOfLines={1} style={{ color: c.fg }}>
                          {short}
                        </AppText>
                        <AppText variant="caption" color="tertiary" numberOfLines={1}>
                          {w.score != null ? `${w.score}` : "—"}
                        </AppText>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.xs }}>
                No daylight overlap in these default blocks — check the hourly strip if you are squeezing in late light.
              </AppText>
            )}
          </View>
        );
      })}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  dayBlock: {
    paddingTop: spacing.lg,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dayBlockFirst: {
    marginTop: 0,
    paddingTop: spacing.sm,
    borderTopWidth: 0,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  bestWindowBand: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderLeftWidth: 3,
  },
  bestWindowEyebrow: {
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 2,
    fontSize: 11,
  },
  bestWindowTime: {
    letterSpacing: -0.25,
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: spacing.md,
  },
  summaryBody: {
    lineHeight: 20,
  },
  chipSection: {
    marginTop: spacing.md,
  },
  chipSectionLabel: {
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    minWidth: 50,
  },
});
