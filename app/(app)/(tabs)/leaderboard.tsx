import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getEventsBySocietyId, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type OOMEntry = {
  memberId: string;
  memberName: string;
  points: number;
  wins: number;
  eventsPlayed: number;
};

export default function LeaderboardScreen() {
  const { societyId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [events, setEvents] = useState<EventDoc[]>([]);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!societyId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [eventsData, membersData] = await Promise.all([
          getEventsBySocietyId(societyId),
          getMembersBySocietyId(societyId),
        ]);
        setEvents(eventsData);
        setMembers(membersData);
      } catch (err) {
        console.error("Failed to load leaderboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [societyId]);

  // Get relevant events for OOM: prefer isOOM events, fallback to all completed events
  const getOOMEvents = (): EventDoc[] => {
    const completedWithResults = events.filter((e) => e.isCompleted && e.results);

    // Check if any events have isOOM explicitly set to true
    const oomEvents = completedWithResults.filter((e) => e.isOOM === true);

    // If we have OOM-flagged events, use only those; otherwise use all completed events
    return oomEvents.length > 0 ? oomEvents : completedWithResults;
  };

  // Calculate OOM standings from completed OOM events
  const calculateOOMStandings = (): OOMEntry[] => {
    const relevantEvents = getOOMEvents();
    const standings: Record<string, OOMEntry> = {};

    // Initialize standings for all members
    members.forEach((m) => {
      standings[m.id] = {
        memberId: m.id,
        memberName: m.displayName || m.name || "Unknown",
        points: 0,
        wins: 0,
        eventsPlayed: 0,
      };
    });

    // Calculate points from each event
    relevantEvents.forEach((event) => {
      if (!event.results) return;

      // Get sorted results for this event (by stableford or grossScore)
      const eventResults = Object.entries(event.results)
        .map(([memberId, result]) => ({
          memberId,
          score: result.stableford ?? result.netScore ?? result.grossScore ?? 0,
        }))
        .sort((a, b) => b.score - a.score);

      // Award points based on position (simple: 10 for 1st, 8 for 2nd, etc.)
      const pointsTable = [10, 8, 6, 5, 4, 3, 2, 1];

      eventResults.forEach((result, index) => {
        if (standings[result.memberId]) {
          standings[result.memberId].eventsPlayed++;
          standings[result.memberId].points += pointsTable[index] ?? 1;

          if (index === 0) {
            standings[result.memberId].wins++;
          }
        }
      });
    });

    // Sort by points, then wins
    return Object.values(standings)
      .filter((s) => s.eventsPlayed > 0)
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.wins - a.wins;
      });
  };

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading leaderboard..." />
        </View>
      </Screen>
    );
  }

  const relevantEvents = getOOMEvents();
  const hasOOMFlaggedEvents = events.some((e) => e.isOOM === true);
  const standings = calculateOOMStandings();

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <AppText variant="title">Order of Merit</AppText>
        <AppText variant="caption" color="secondary">
          {relevantEvents.length} event{relevantEvents.length !== 1 ? "s" : ""} completed
          {!hasOOMFlaggedEvents && relevantEvents.length > 0 ? " (all events)" : ""}
        </AppText>
      </View>

      {standings.length === 0 ? (
        <EmptyState
          icon={<Feather name="award" size={24} color={colors.textTertiary} />}
          title="No Order of Merit Points Yet"
          message="Complete events with results to see the leaderboard. Mark events as 'Order of Merit' to track season standings separately."
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
                    <View style={styles.statsRow}>
                      <AppText variant="caption" color="secondary">
                        {entry.eventsPlayed} event{entry.eventsPlayed !== 1 ? "s" : ""}
                      </AppText>
                      {entry.wins > 0 && (
                        <View style={[styles.winsBadge, { backgroundColor: colors.success + "20" }]}>
                          <AppText variant="small" style={{ color: colors.success }}>
                            {entry.wins} win{entry.wins !== 1 ? "s" : ""}
                          </AppText>
                        </View>
                      )}
                    </View>
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
            Points are awarded based on finishing position: 1st = 10pts, 2nd = 8pts, 3rd = 6pts, etc.
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
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
  winsBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.sm,
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
