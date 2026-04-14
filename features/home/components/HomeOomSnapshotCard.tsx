import { StyleSheet, View } from "react-native";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { DashboardLeaderboardPreview } from "@/components/dashboard/DashboardLeaderboardPreview";
import type { OrderOfMeritEntry } from "@/lib/db_supabase/resultsRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  rank: string;
  points: string;
  unranked: boolean;
  entries: OrderOfMeritEntry[];
  memberId: string | undefined;
  onOpenLeaderboard: () => void;
  formatPoints: (pts: number) => string;
};

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

export function HomeOomSnapshotCard({
  rank,
  points,
  unranked,
  entries,
  memberId,
  onOpenLeaderboard,
  formatPoints,
}: Props) {
  const colors = getColors();

  return (
    <View style={styles.wrap}>
      <AppCard style={[styles.summaryCard, { borderColor: colors.borderLight }]}>
        <AppText variant="bodyBold">Order of Merit</AppText>
        <AppText variant="caption" color="secondary" style={{ marginTop: 2 }}>
          Members Only
        </AppText>
        <AppText variant="body" style={{ marginTop: spacing.xs }}>
          {unranked ? "You are not ranked yet" : `You are ${ordinalLabel(rank)}`}
        </AppText>
        <AppText variant="small" color="secondary">
          {points} pts this season
        </AppText>
      </AppCard>
      {entries.length > 0 ? (
        <DashboardLeaderboardPreview
          entries={entries.slice(0, 3)}
          memberId={memberId}
          formatPoints={(pts) => `${formatPoints(pts)} pts`}
          onOpenLeaderboard={onOpenLeaderboard}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  summaryCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
});

