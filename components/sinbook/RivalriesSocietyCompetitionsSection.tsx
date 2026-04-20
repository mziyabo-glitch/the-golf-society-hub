import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { getColors, spacing, radius, iconSize } from "@/lib/ui/theme";

type Colors = ReturnType<typeof getColors>;

type Props = {
  colors: Colors;
  societyName?: string | null;
  hasActiveLeague: boolean;
  scopeDescription?: string | null;
  myRank: number | null;
  myTotalBirdies: number | null;
  myEventsCounted: number | null;
  canManageBirdiesLeague: boolean;
  onOpenBirdiesLeague: () => void;
};

function ordinalLabel(rank: number | null): string {
  if (rank == null || !Number.isFinite(rank) || rank <= 0) return "—";
  const n = rank;
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * Groups society-wide play (Birdies League) above head-to-head rivalries on the Rivalries tab.
 */
export function RivalriesSocietyCompetitionsSection({
  colors,
  societyName,
  hasActiveLeague,
  scopeDescription,
  myRank,
  myTotalBirdies,
  myEventsCounted,
  canManageBirdiesLeague,
  onOpenBirdiesLeague,
}: Props) {
  const rankLine =
    hasActiveLeague && myRank != null && myRank > 0
      ? `${ordinalLabel(myRank)} · ${myTotalBirdies ?? 0} birdies${myEventsCounted != null && myEventsCounted > 0 ? ` · ${myEventsCounted} events` : ""}`
      : hasActiveLeague
        ? "Tap for full leaderboard"
        : canManageBirdiesLeague
          ? "No active league — tap to start from the next event"
          : "No active league yet — tap for details";

  return (
    <View style={styles.wrap}>
      <AppText variant="captionBold" color="muted" style={styles.groupEyebrow}>
        Society competitions
      </AppText>
      <AppText variant="small" color="secondary" style={styles.groupIntro}>
        Society-wide standings (everyone in {societyName?.trim() || "the club"}). Head-to-head rivalries are below.
      </AppText>

      <AppCard variant="subtle" padding="sm" style={[styles.groupCard, { borderColor: colors.borderLight }]}>
        <Pressable
          onPress={onOpenBirdiesLeague}
          style={({ pressed }) => [styles.rowPress, { opacity: pressed ? 0.88 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Open Birdies League"
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.highlightMuted }]}>
            <Feather name="target" size={20} color={colors.primary} />
          </View>
          <View style={styles.rowBody}>
            <AppText variant="bodyBold" numberOfLines={1}>
              Birdies League
            </AppText>
            {scopeDescription ? (
              <AppText variant="caption" color="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
                {scopeDescription}
              </AppText>
            ) : null}
            <AppText variant="small" color="secondary" numberOfLines={2} style={{ marginTop: 4 }}>
              {rankLine}
            </AppText>
          </View>
          <Feather name="chevron-right" size={iconSize.md} color={colors.textTertiary} />
        </Pressable>
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  groupEyebrow: {
    letterSpacing: 0.6,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  groupIntro: {
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  groupCard: {
    borderWidth: 1,
    borderRadius: radius.md,
  },
  rowPress: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
});
