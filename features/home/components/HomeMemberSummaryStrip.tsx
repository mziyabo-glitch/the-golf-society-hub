import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

function ordinalLabel(rawRank: string): string {
  const n = Number(rawRank);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

type Props = {
  handicapIndexDisplay: string | null;
  oomRankMain: string;
  oomPointsMain: string;
  showUnrankedHint: boolean;
  onEditHandicap: () => void;
  onOpenLeaderboard?: () => void;
  showOom?: boolean;
};

export function HomeMemberSummaryStrip({
  handicapIndexDisplay,
  oomRankMain,
  oomPointsMain,
  showUnrankedHint,
  onEditHandicap,
  onOpenLeaderboard,
  showOom = true,
}: Props) {
  const colors = getColors();
  const hi = handicapIndexDisplay != null ? handicapIndexDisplay : "—";
  const oomRankLabel = showUnrankedHint ? "Unranked" : ordinalLabel(oomRankMain);

  return (
    <View
      style={[
        styles.shell,
        {
          borderColor: colors.borderLight,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <Pressable
        onPress={onEditHandicap}
        accessibilityRole="button"
        accessibilityLabel="Edit handicap index"
        style={({ pressed }) => [styles.cell, styles.cellBorder, { borderColor: colors.borderLight, opacity: pressed ? 0.88 : 1 }]}
      >
        <Feather name="activity" size={15} color={colors.primary} />
        <View style={styles.cellText}>
          <AppText variant="captionBold" color="muted" numberOfLines={1}>
            Handicap
          </AppText>
          <AppText variant="bodyBold" numberOfLines={1}>
            {hi}
          </AppText>
        </View>
      </Pressable>

      {showOom ? (
        <Pressable
          onPress={onOpenLeaderboard}
          disabled={!onOpenLeaderboard}
          accessibilityRole={onOpenLeaderboard ? "button" : undefined}
          accessibilityLabel="Open order of merit leaderboard"
          style={({ pressed }) => [
            styles.cell,
            styles.cellBorder,
            { borderColor: colors.borderLight, opacity: onOpenLeaderboard && pressed ? 0.88 : 1 },
          ]}
        >
          <Feather name="award" size={15} color={colors.highlight} />
          <View style={styles.cellText}>
            <AppText variant="captionBold" color="muted" numberOfLines={1}>
              OOM rank
            </AppText>
            <AppText variant="bodyBold" numberOfLines={1}>
              {oomRankLabel}
            </AppText>
          </View>
        </Pressable>
      ) : null}

      {showOom ? (
        <View style={[styles.cell, { flex: showOom ? 1 : undefined }]}>
          <Feather name="bar-chart-2" size={15} color={colors.textSecondary} />
          <View style={styles.cellText}>
            <AppText variant="captionBold" color="muted" numberOfLines={1}>
              OOM pts
            </AppText>
            <AppText variant="bodyBold" numberOfLines={1}>
              {oomPointsMain}
            </AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    minHeight: 48,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  cellBorder: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  cellText: {
    flex: 1,
    minWidth: 0,
  },
});
