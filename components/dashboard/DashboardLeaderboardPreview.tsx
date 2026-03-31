/**
 * Top 3 Order of Merit snapshot with link to full leaderboard.
 */

import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import type { OrderOfMeritEntry } from "@/lib/db_supabase/resultsRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { dashboardShell } from "./dashboardCardStyles";

type Props = {
  entries: OrderOfMeritEntry[];
  memberId: string | undefined;
  formatPoints: (pts: number) => string;
  onOpenLeaderboard: () => void;
};

export function DashboardLeaderboardPreview({
  entries,
  memberId,
  formatPoints,
  onOpenLeaderboard,
}: Props) {
  const colors = getColors();

  if (entries.length === 0) return null;

  return (
    <Pressable
      onPress={onOpenLeaderboard}
      accessibilityRole="button"
      accessibilityLabel="Open full leaderboard"
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <View style={[dashboardShell.card, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
        <View style={dashboardShell.sectionEyebrow}>
          <Feather name="award" size={16} color={colors.primary} />
          <AppText variant="captionBold" color="primary">
            Leaderboard
          </AppText>
        </View>

        <AppText variant="small" color="secondary" style={styles.sub}>
          Top 3 · Order of Merit
        </AppText>

        {entries.map((entry, idx) => {
          const isMe = entry.memberId === memberId;
          return (
            <View
              key={entry.memberId}
              style={[
                styles.row,
                idx > 0 && [styles.rowDivider, { borderTopColor: colors.borderLight }],
                isMe && { backgroundColor: `${colors.primary}10`, borderRadius: radius.sm },
              ]}
            >
              <View style={[styles.medal, idx === 0 && { backgroundColor: colors.highlightMuted }]}>
                <AppText variant="captionBold" style={{ color: colors.textSecondary }}>
                  {String(entry.rank)}
                </AppText>
              </View>
              <AppText variant={isMe ? "bodyBold" : "body"} style={{ flex: 1 }} numberOfLines={1}>
                {String(entry.memberName ?? "Unknown")}
                {isMe ? " · You" : ""}
              </AppText>
              <AppText variant="captionBold" color="primary">
                {formatPoints(Number(entry.totalPoints) || 0)}
              </AppText>
            </View>
          );
        })}

        <View style={styles.footer}>
          <AppText variant="small" color="tertiary">
            View all standings
          </AppText>
          <Feather name="chevron-right" size={16} color={colors.textTertiary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sub: {
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  medal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: spacing.sm,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
});
