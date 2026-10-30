import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import type { TeeSheetManageOverviewStats } from "@/lib/teeSheet/teeSheetManageOverview";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type Props = {
  stats: TeeSheetManageOverviewStats;
  publishedAt: string | null | undefined;
};

function StatCell({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const colors = getColors();
  return (
    <View style={styles.statCell}>
      <AppText variant="title" style={{ color: accent ?? colors.text }}>
        {value}
      </AppText>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
    </View>
  );
}

export function TeeSheetManageOverviewCard({ stats, publishedAt }: Props) {
  const colors = getColors();
  const publishedBadge = publishedAt ? (
    <View style={[styles.badge, { backgroundColor: colors.success + "22" }]}>
      <Feather name="check-circle" size={12} color={colors.success} />
      <AppText variant="captionBold" style={{ color: colors.success, marginLeft: 4 }}>
        Published
      </AppText>
    </View>
  ) : (
    <View style={[styles.badge, { backgroundColor: colors.warning + "18" }]}>
      <Feather name="edit-3" size={12} color={colors.warning} />
      <AppText variant="captionBold" style={{ color: colors.warning, marginLeft: 4 }}>
        Draft
      </AppText>
    </View>
  );

  return (
    <AppCard style={styles.card}>
      <View style={styles.headerRow}>
        <AppText variant="subheading" color="primary">
          Overview
        </AppText>
        {publishedBadge}
      </View>
      <View style={styles.statsRow}>
        <StatCell label="Registered" value={stats.registeredCount} />
        <StatCell label="Paid" value={stats.paidCount} accent={colors.success} />
        <StatCell label="Assigned" value={stats.assignedCount} accent={colors.primary} />
        <StatCell label="Unassigned" value={stats.unassignedCount} accent={colors.warning} />
      </View>
      <AppText variant="small" color="muted" style={{ marginTop: spacing.sm }}>
        {stats.draftLabel}
        {stats.onSheetCount > 0
          ? ` · ${stats.onSheetCount} on sheet${stats.poolRemainingCount > 0 ? ` · ${stats.poolRemainingCount} still in pool` : ""}`
          : ""}
      </AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  statCell: {
    minWidth: "22%",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
});
