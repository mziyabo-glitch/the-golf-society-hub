/**
 * Premium, decision-first playability surface (not a raw weather grid).
 */

import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { getColors, spacing, radius, premiumTokens } from "@/lib/ui/theme";
import type { PlayabilityInsight, PlayabilityLevel } from "@/lib/playability/types";

const LEVEL_LABEL: Record<PlayabilityLevel, string> = {
  excellent: "Excellent",
  good: "Good",
  mixed: "Mixed",
  poor: "Poor",
  severe: "Severe",
};

function levelColor(level: PlayabilityLevel, colors: ReturnType<typeof getColors>): string {
  switch (level) {
    case "excellent":
      return colors.primary;
    case "good":
      return colors.primaryLight;
    case "mixed":
      return colors.highlight;
    case "poor":
      return colors.warning;
    default:
      return colors.error;
  }
}

type Props = {
  loading: boolean;
  error: string | null;
  insight: PlayabilityInsight | null;
  coordsHint?: string | null;
  onRefresh?: () => void;
  /** When coordinates could not be resolved */
  noLocationMessage?: string;
};

export function PlayabilityCard({
  loading,
  error,
  insight,
  coordsHint,
  onRefresh,
  noLocationMessage = "Link an imported course or add a searchable name to see playability for this venue.",
}: Props) {
  const colors = getColors();
  const c = levelColor(insight?.level ?? "mixed", colors);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: premiumTokens.cardBorder,
        },
        premiumTokens.cardShadow,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconRing, { backgroundColor: `${colors.primary}14` }]}>
            <Feather name="flag" size={18} color={colors.primary} />
          </View>
          <View>
            <AppText variant="captionBold" color="primary">
              Playability
            </AppText>
            {coordsHint ? (
              <AppText variant="small" color="tertiary" numberOfLines={1} style={styles.coordsHint}>
                {coordsHint}
              </AppText>
            ) : null}
          </View>
        </View>
        {onRefresh ? (
          <Pressable onPress={onRefresh} hitSlop={12} style={styles.refreshBtn}>
            <Feather name="refresh-cw" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
            Building your round picture…
          </AppText>
        </View>
      ) : error ? (
        <AppText variant="small" style={{ color: colors.error }}>
          {error}
        </AppText>
      ) : !insight ? (
        <AppText variant="small" color="secondary">
          {noLocationMessage}
        </AppText>
      ) : (
        <>
          <AppText variant="h2" style={[styles.headline, { color: c }]} numberOfLines={2}>
            {insight.label}
          </AppText>

          <View style={styles.ratingRow}>
            <AppText style={[styles.bigRating, { color: c }]}>{insight.rating.toFixed(1)}</AppText>
            <View style={styles.ratingMeta}>
              <AppText variant="captionBold" style={{ color: c }}>
                {LEVEL_LABEL[insight.level]}
              </AppText>
              <AppText variant="small" color="secondary" numberOfLines={3}>
                {insight.summary}
              </AppText>
            </View>
          </View>

          <View style={[styles.whyBlock, { borderTopColor: colors.borderLight, backgroundColor: colors.backgroundSecondary }]}>
            <AppText variant="captionBold" color="secondary" style={styles.whyEyebrow}>
              Why this rating
            </AppText>
            <AppText variant="small" color="secondary" style={styles.whyBody}>
              {insight.ratingExplanation}
            </AppText>
          </View>

          {insight.recommendedAction ? (
            <View style={[styles.actionCallout, { backgroundColor: `${colors.primary}10` }]}>
              <Feather name="info" size={16} color={colors.primary} style={{ marginTop: 1 }} />
              <AppText variant="small" color="secondary" style={{ flex: 1, marginLeft: spacing.sm }}>
                {insight.recommendedAction}
              </AppText>
            </View>
          ) : null}

          {insight.bestWindow ? (
            <View style={[styles.pillRow, { backgroundColor: colors.backgroundSecondary }]}>
              <Feather name="clock" size={14} color={colors.primary} />
              <AppText variant="captionBold" style={{ marginLeft: spacing.xs, flex: 1 }}>
                Best window · {insight.bestWindow}
              </AppText>
            </View>
          ) : insight.bestWindowFallback ? (
            <View style={[styles.pillRow, { backgroundColor: `${colors.warning}12` }]}>
              <Feather name="sun" size={14} color={colors.warning} />
              <AppText variant="captionBold" color="secondary" style={{ marginLeft: spacing.xs, flex: 1 }}>
                {insight.bestWindowFallback}
              </AppText>
            </View>
          ) : null}

          <View style={styles.metrics}>
            <Metric icon="wind" label="Wind" value={insight.windSummary} colors={colors} />
            <Metric icon="cloud-rain" label="Rain" value={insight.rainSummary} colors={colors} />
            <Metric icon="thermometer" label="Comfort" value={insight.comfortSummary} colors={colors} />
          </View>

          {insight.warnings.length > 0 ? (
            <View style={[styles.warnings, { borderTopColor: colors.borderLight }]}>
              <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.xs }}>
                Heads-up
              </AppText>
              {insight.warnings.slice(0, 4).map((w, i) => (
                <View key={i} style={styles.warningLine}>
                  <Feather name="alert-circle" size={14} color={colors.highlight} style={{ marginTop: 2 }} />
                  <AppText variant="small" color="secondary" style={{ flex: 1, marginLeft: spacing.xs }}>
                    {w}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function Metric({
  icon,
  label,
  value,
  colors,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={styles.metric}>
      <Feather name={icon} size={14} color={colors.textTertiary} />
      <AppText variant="captionBold" color="tertiary" style={styles.metricLabel}>
        {label}
      </AppText>
      <AppText variant="small" color="secondary" numberOfLines={3}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  iconRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  coordsHint: {
    marginTop: 2,
    maxWidth: "92%",
  },
  refreshBtn: {
    padding: spacing.xs,
  },
  centerBlock: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  headline: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
    marginBottom: spacing.sm,
  },
  actionCallout: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  whyBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  whyEyebrow: {
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontSize: 11,
  },
  whyBody: {
    lineHeight: 20,
  },
  bigRating: {
    fontSize: 44,
    fontWeight: "800",
    lineHeight: 48,
    fontVariant: ["tabular-nums"],
  },
  ratingMeta: {
    flex: 1,
    paddingTop: 4,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  metrics: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metric: {
    flex: 1,
    minWidth: 0,
  },
  metricLabel: {
    marginTop: 4,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    fontSize: 11,
  },
  warnings: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  warningLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
});
