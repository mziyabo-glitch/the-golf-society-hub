/**
 * Dashboard playability teaser — same usePlayabilityBundle path as Weather tab / event detail.
 */

import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import { usePlayabilityBundle } from "@/lib/playability/usePlayabilityBundle";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { dashboardShell, DASHBOARD_CARD_RADIUS } from "./dashboardCardStyles";
import type { PlayabilityLevel } from "@/lib/playability/types";
import { comfortScan, rainIntensityScan, windImpactScan } from "@/lib/playability/weatherVisual";
import { mapHourlyForecastPointsToRoundSamples } from "@/lib/playability/playabilityEngine";
import { evaluateFiveDayPlayabilityPlan, formatDashboardFiveDayPlanning } from "@/lib/weather/playabilityPlanner";

const LEVEL_WORD: Record<PlayabilityLevel, string> = {
  excellent: "Excellent",
  good: "Good",
  mixed: "Mixed",
  poor: "Challenging",
  severe: "Very challenging",
};

type Props = {
  nextEvent: EventDoc | null;
  enabled: boolean;
  onOpenWeatherTab: () => void;
  /** Local tee time e.g. "09:10" — soft preference for best window (daylight-only) */
  preferredTeeTimeLocal?: string | null;
};

function todayYmd(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const day = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function targetYmdFromEvent(event: EventDoc | null): string {
  const d = event?.date?.trim();
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const day = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function levelCardTint(colors: ReturnType<typeof getColors>, level: PlayabilityLevel): string {
  switch (level) {
    case "excellent":
      return `${colors.success}0C`;
    case "good":
      return `${colors.primary}0A`;
    case "mixed":
      return `${colors.warning}0C`;
    case "poor":
      return `${colors.warning}12`;
    case "severe":
      return `${colors.error}0C`;
    default:
      return colors.surface;
  }
}

export function DashboardPlayabilityMiniCard({
  nextEvent,
  enabled,
  onOpenWeatherTab,
  preferredTeeTimeLocal = null,
}: Props) {
  const colors = getColors();
  const courseId = (nextEvent?.courseId || nextEvent?.course_id || null) as string | null | undefined;
  const courseName = (nextEvent?.courseName || "Golf course").trim();
  const ymd = targetYmdFromEvent(nextEvent);

  const bundle = usePlayabilityBundle(!!enabled && !!nextEvent, ymd, courseId ?? null, null, courseName, {
    preferredTeeTimeLocal,
  });

  const fiveDayPlanning = useMemo(() => {
    if (!bundle.forecast?.hourly?.length) return null;
    const hourly = mapHourlyForecastPointsToRoundSamples(bundle.forecast.hourly);
    const daySunlight = bundle.forecast.daily.map((d) => ({
      dateYmd: d.dateYmd,
      sunriseIso: d.sunrise ?? null,
      sunsetIso: d.sunset ?? null,
    }));
    const plan = evaluateFiveDayPlayabilityPlan({
      countryCode: "GB",
      startDateYmd: todayYmd(),
      hourly,
      daySunlight,
    });
    return formatDashboardFiveDayPlanning(plan);
  }, [bundle.forecast]);

  const courseLabel = nextEvent?.courseName?.trim() || "Your next course";

  const insightSurface =
    bundle.insight != null ? levelCardTint(colors, bundle.insight.level) : colors.surface;

  return (
    <Pressable
      onPress={onOpenWeatherTab}
      accessibilityRole="button"
      accessibilityLabel="Open Weather for full playability"
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <View
        style={[
          dashboardShell.card,
          {
            borderColor: colors.borderLight,
            backgroundColor: insightSurface,
          },
        ]}
      >
        <View style={dashboardShell.sectionEyebrow}>
          <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}14` }]}>
            <Feather name="cloud" size={14} color={colors.primary} />
          </View>
          <AppText variant="captionBold" color="primary" numberOfLines={1}>
            Course conditions
          </AppText>
        </View>

        <AppText variant="small" color="secondary" numberOfLines={1} style={styles.course}>
          {courseLabel}
        </AppText>

        {!nextEvent ? (
          <AppText variant="small" color="tertiary" style={styles.body}>
            No upcoming event. Open Weather to check any course.
          </AppText>
        ) : bundle.loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
              Loading playability…
            </AppText>
          </View>
        ) : bundle.error ? (
          <AppText variant="small" style={{ color: colors.error }}>{bundle.error}</AppText>
        ) : !bundle.insight ? (
          <AppText variant="small" color="tertiary" style={styles.body}>
            Add a linked course to see wind, rain, and comfort for this round.
          </AppText>
        ) : (
          <>
            <View style={styles.ratingBlock}>
              <AppText variant="captionBold" color="muted" style={{ marginBottom: 2 }} numberOfLines={1}>
                Next round
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                {bundle.insight.engineSnapshot?.icon ? (
                  <Feather
                    name={bundle.insight.engineSnapshot.icon as keyof typeof Feather.glyphMap}
                    size={22}
                    color={colors.primary}
                  />
                ) : null}
                <AppText variant="h2" style={[styles.levelWord, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                  {bundle.insight.engineSnapshot?.statusLabel ?? LEVEL_WORD[bundle.insight.level]}
                </AppText>
              </View>
              <AppText variant="captionBold" color="secondary" style={styles.scoreLine} numberOfLines={2}>
                {bundle.insight.engineSnapshot?.score != null
                  ? `Score ${bundle.insight.engineSnapshot.score}/100`
                  : `${bundle.insight.rating.toFixed(1)}/10 playability`}
                {" · "}
                {bundle.insight.engineSnapshot?.message ?? bundle.insight.label}
              </AppText>
            </View>

            {fiveDayPlanning ? (
              <View
                style={[
                  styles.planningBlock,
                  { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}22` },
                ]}
              >
                <View style={styles.planningEyebrow}>
                  <Feather name="calendar" size={12} color={colors.primary} />
                  <AppText variant="captionBold" color="primary" style={{ marginLeft: 6 }} numberOfLines={1}>
                    Next 5 days
                  </AppText>
                </View>
                {fiveDayPlanning.bestNextSlot ? (
                  <AppText variant="bodyBold" color="primary" style={styles.slotLine} numberOfLines={2}>
                    {fiveDayPlanning.bestNextSlot}
                  </AppText>
                ) : null}
                <AppText
                  variant="caption"
                  color="muted"
                  style={[
                    styles.weekOutlook,
                    fiveDayPlanning.bestNextSlot ? { marginTop: 6 } : { marginTop: 2 },
                  ]}
                  numberOfLines={2}
                >
                  {fiveDayPlanning.weekOutlook}
                </AppText>
              </View>
            ) : null}

            <View style={styles.indicators}>
              <Indicator
                icon="wind"
                emoji={windImpactScan(bundle.insight.windImpact).emoji}
                text={bundle.insight.engineSnapshot?.windRainSummary ?? bundle.insight.windSummary}
                colors={colors}
              />
              <Indicator
                icon="cloud-rain"
                emoji={rainIntensityScan(bundle.insight.rainIntensity).emoji}
                text={bundle.insight.rainSummary}
                colors={colors}
              />
              <Indicator
                icon="thermometer"
                emoji={comfortScan(bundle.insight.comfort).emoji}
                text={bundle.insight.comfortSummary}
                colors={colors}
              />
            </View>

            {bundle.insight.bestWindow ? (
              <View style={[styles.windowPill, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}22` }]}>
                <Feather name="clock" size={13} color={colors.primary} />
                <AppText variant="captionBold" color="primary" style={{ marginLeft: spacing.xs, flex: 1 }} numberOfLines={1}>
                  Best window · {bundle.insight.bestWindow}
                </AppText>
              </View>
            ) : bundle.insight.bestWindowFallback ? (
              <View style={[styles.windowPill, { backgroundColor: `${colors.warning}14`, borderColor: `${colors.warning}33` }]}>
                <Feather name="sun" size={13} color={colors.warning} />
                <AppText variant="captionBold" color="secondary" style={{ marginLeft: spacing.xs, flex: 1 }} numberOfLines={2}>
                  {bundle.insight.bestWindowFallback}
                </AppText>
              </View>
            ) : null}
          </>
        )}

        <View style={[styles.ctaFoot, { borderTopColor: colors.borderLight, backgroundColor: `${colors.surface}E6` }]}>
          <AppText variant="captionBold" color="primary">
            Full weather & forecast
          </AppText>
          <Feather name="chevron-right" size={18} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}

function Indicator({
  icon,
  emoji,
  text,
  colors,
}: {
  icon: keyof typeof Feather.glyphMap;
  emoji: string;
  text: string;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={styles.indicatorRow}>
      <AppText style={styles.indicatorEmoji}>{emoji}</AppText>
      <Feather name={icon} size={12} color={colors.primary} style={{ marginTop: 3 }} />
      <AppText variant="captionBold" color="secondary" style={styles.indicatorText} numberOfLines={1}>
        {text}
      </AppText>
    </View>
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
    marginTop: 4,
    marginBottom: spacing.xs,
  },
  body: {
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  loading: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  ratingBlock: {
    marginTop: spacing.xs,
  },
  levelWord: {
    letterSpacing: -0.35,
    fontWeight: "800",
  },
  scoreLine: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  planningBlock: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  planningEyebrow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  slotLine: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  weekOutlook: {
    marginTop: 6,
    lineHeight: 17,
  },
  indicators: {
    marginTop: spacing.sm,
    gap: 6,
  },
  indicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  indicatorEmoji: {
    fontSize: 18,
    lineHeight: 22,
    width: 24,
    textAlign: "center",
  },
  indicatorText: {
    flex: 1,
    lineHeight: 18,
    fontSize: 13,
  },
  windowPill: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  ctaFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginHorizontal: -spacing.md,
    marginBottom: -(spacing.sm + 2),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: DASHBOARD_CARD_RADIUS,
    borderBottomRightRadius: DASHBOARD_CARD_RADIUS,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
});
