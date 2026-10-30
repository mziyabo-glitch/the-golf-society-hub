/**
 * Compact OOM stat tiles under the hero — rank + points, equal width.
 */

import { View, Pressable, StyleSheet } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { getColors, spacing } from "@/lib/ui/theme";
import { dashboardShell } from "./dashboardCardStyles";

const TILE_MIN_HEIGHT = 78;

type Props = {
  oomRankMain: string;
  showUnrankedHint: boolean;
  oomPointsMain: string;
  canOpenLeaderboard: boolean;
  onOpenLeaderboard: () => void;
};

export function DashboardOomTopMetricsRow({
  oomRankMain,
  showUnrankedHint,
  oomPointsMain,
  canOpenLeaderboard,
  onOpenLeaderboard,
}: Props) {
  const colors = getColors();
  const tintBg = `${colors.primary}07`;
  const sh = { borderColor: colors.borderLight, backgroundColor: tintBg };

  const rankTile = (
    <MetricTile
      value={oomRankMain}
      subtitle="OOM rank"
      tertiary={showUnrankedHint ? "Unranked" : undefined}
      mutedValue={oomRankMain === "—"}
      minHeight={TILE_MIN_HEIGHT}
      colors={colors}
      sh={sh}
    />
  );

  const pointsTile = (
    <MetricTile
      value={oomPointsMain}
      subtitle="OOM points"
      tertiary={undefined}
      mutedValue={false}
      minHeight={TILE_MIN_HEIGHT}
      colors={colors}
      sh={sh}
    />
  );

  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        {canOpenLeaderboard ? (
          <Pressable
            onPress={onOpenLeaderboard}
            style={({ pressed }) => [styles.cellFill, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open Order of Merit leaderboard"
          >
            {rankTile}
          </Pressable>
        ) : (
          <View style={styles.cellFill}>{rankTile}</View>
        )}
      </View>

      <View style={styles.cell}>
        {canOpenLeaderboard ? (
          <Pressable
            onPress={onOpenLeaderboard}
            style={({ pressed }) => [styles.cellFill, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open Order of Merit leaderboard"
          >
            {pointsTile}
          </Pressable>
        ) : (
          <View style={styles.cellFill}>{pointsTile}</View>
        )}
      </View>
    </View>
  );
}

function MetricTile({
  value,
  subtitle,
  tertiary,
  mutedValue,
  minHeight,
  colors,
  sh,
}: {
  value: string;
  subtitle: string;
  tertiary?: string;
  mutedValue: boolean;
  minHeight: number;
  colors: ReturnType<typeof getColors>;
  sh: { borderColor: string; backgroundColor: string };
}) {
  return (
    <View
      style={[
        dashboardShell.cardBase,
        sh,
        { minHeight, flex: 1, justifyContent: "center", padding: spacing.sm },
      ]}
    >
      <AppText
        style={[styles.metric, { color: mutedValue ? colors.textTertiary : colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </AppText>
      <AppText variant="caption" color="tertiary" style={styles.subtitle} numberOfLines={2}>
        {subtitle}
      </AppText>
      {tertiary ? (
        <AppText variant="caption" color="tertiary" style={styles.tertiary} numberOfLines={1}>
          {tertiary}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    marginBottom: spacing.sm + 2,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  cellFill: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  metric: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    opacity: 0.85,
  },
  tertiary: {
    marginTop: 2,
    fontSize: 11,
    opacity: 0.8,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
});
