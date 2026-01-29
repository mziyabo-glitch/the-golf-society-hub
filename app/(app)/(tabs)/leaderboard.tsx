import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { getOomLeaderboard } from "@/lib/db_supabase/oomRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type OOMEntry = {
  memberId: string;
  memberName: string;
  points: number;
};

export default function LeaderboardScreen() {
  const { societyId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [standings, setStandings] = useState<OOMEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!societyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [membersData, leaderboardData] = await Promise.all([
        getMembersBySocietyId(societyId),
        getOomLeaderboard(societyId),
      ]);
      const membersById = new Map(membersData.map((member) => [member.id, member]));
      const enriched = leaderboardData
        .map((entry) => ({
          memberId: entry.member_id,
          memberName:
            membersById.get(entry.member_id)?.displayName
            || membersById.get(entry.member_id)?.name
            || "Unknown",
          points: entry.total_points,
        }))
        .filter((entry) => entry.points > 0)
        .sort((a, b) => b.points - a.points);
      setMembers(membersData);
      setStandings(enriched);
    } catch (err) {
      console.error("Failed to load leaderboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading leaderboard..." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <AppText variant="title">Order of Merit</AppText>
        <AppText variant="caption" color="secondary">
          {standings.length} member{standings.length !== 1 ? "s" : ""} with points
        </AppText>
      </View>

      {standings.length === 0 ? (
        <EmptyState
          icon={<Feather name="award" size={24} color={colors.textTertiary} />}
          title="No Order of Merit Points Yet"
          message="Enter points for OOM events to see the leaderboard."
        />
      ) : (
        <View style={styles.list}>
          {standings.map((entry, index) => {
            const isTop3 = index < 3;
            const medalColors = [colors.warning, "#C0C0C0", "#CD7F32"];

            return (
              <AppCard key={entry.memberId} style={styles.standingCard}>
                <View style={styles.standingRow}>
                  {/* Position */}
                  <View
                    style={[
                      styles.positionBadge,
                      {
                        backgroundColor: isTop3
                          ? medalColors[index] + "20"
                          : colors.backgroundTertiary,
                      },
                    ]}
                  >
                    {isTop3 ? (
                      <Feather
                        name="award"
                        size={16}
                        color={medalColors[index]}
                      />
                    ) : (
                      <AppText variant="captionBold" color="secondary">
                        {index + 1}
                      </AppText>
                    )}
                  </View>

                  {/* Member Info */}
                  <View style={styles.memberInfo}>
                    <AppText variant="bodyBold">{entry.memberName}</AppText>
                  </View>

                  {/* Points */}
                  <View style={styles.pointsContainer}>
                    <AppText variant="h1" color="primary">{entry.points}</AppText>
                    <AppText variant="small" color="tertiary">pts</AppText>
                  </View>
                </View>
              </AppCard>
            );
          })}
        </View>
      )}

      {/* Info card about OOM */}
      <AppCard style={styles.infoCard}>
        <View style={styles.infoContent}>
          <Feather name="info" size={16} color={colors.textTertiary} />
          <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
            Points are summed from OOM events only.
          </AppText>
        </View>
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    marginBottom: spacing.lg,
  },
  list: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  standingCard: {
    marginBottom: 0,
  },
  standingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  positionBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInfo: {
    flex: 1,
  },
  pointsContainer: {
    alignItems: "center",
  },
  infoCard: {
    marginTop: spacing.sm,
  },
  infoContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
});
