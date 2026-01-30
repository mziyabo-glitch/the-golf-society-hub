import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";

import { useBootstrap } from "@/lib/useBootstrap";
import { getColors, spacing } from "@/lib/ui/theme";
import { getOrderOfMeritTotals, getOrderOfMeritLog } from "@/lib/db_supabase/resultsRepo";

type ViewMode = "leaderboard" | "log";

export default function LeaderboardScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const { societyId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const initialMode: ViewMode = params?.view === "log" ? "log" : "leaderboard";
  const [mode, setMode] = useState<ViewMode>(initialMode);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totals, setTotals] = useState<any[]>([]);
  const [oomEventCount, setOomEventCount] = useState<number>(0);

  const [logRows, setLogRows] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!societyId) return;

    setLoading(true);
    setError(null);

    try {
      if (mode === "leaderboard") {
        const res = await getOrderOfMeritTotals(societyId);
        setTotals(res?.totals ?? res ?? []);
        setOomEventCount(res?.oomEventCount ?? res?.eventsCount ?? 0);
      } else {
        const rows = await getOrderOfMeritLog(societyId);
        setLogRows(rows ?? []);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, [societyId, mode]);

  // Refetch on focus to pick up changes after entering points
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const groupedLog = useMemo(() => {
    // Expect rows like:
    // { eventId, eventName, eventDate, format, memberName, points }
    const groups = new Map<string, any[]>();
    for (const r of logRows) {
      const key = r.eventId ?? r.event_id ?? "unknown";
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).map(([eventId, rows]) => {
      const first = rows[0] ?? {};
      return {
        eventId,
        eventName: first.eventName ?? first.event_name ?? "Event",
        eventDate: first.eventDate ?? first.event_date ?? null,
        format: first.format ?? null,
        rows,
      };
    });
  }, [logRows]);

  if (bootstrapLoading) {
    return (
      <Screen>
        <LoadingState label="Loading..." />
      </Screen>
    );
  }

  if (!societyId) {
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="alert-triangle" size={24} color={colors.error} />}
          title="No society"
          message="Join or create a society to view leaderboards."
        />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <LoadingState label="Loading leaderboard..." />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="alert-triangle" size={24} color={colors.error} />}
          title="Couldn’t load"
          message={error}
        />
      </Screen>
    );
  }

  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Format label for event format
  const formatLabel = (format: string | null) => {
    if (!format) return "";
    return format.charAt(0).toUpperCase() + format.slice(1);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <AppText variant="h2" style={{ marginBottom: spacing.xs }}>
          Order of Merit
        </AppText>

        <View style={styles.toggleRow}>
          <SecondaryButton
            size="sm"
            onPress={() => setMode("leaderboard")}
            disabled={mode === "leaderboard"}
          >
            Season Leaderboard
          </SecondaryButton>

          <SecondaryButton size="sm" onPress={() => setMode("log")} disabled={mode === "log"}>
            Results Log
          </SecondaryButton>

          <PrimaryButton size="sm" onPress={fetchData}>
            Refresh
          </PrimaryButton>
        </View>

        {mode === "leaderboard" && (
          <>
            <AppText variant="caption" color="secondary" style={{ marginBottom: spacing.md }}>
              {oomEventCount ? `${oomEventCount} Order of Merit event(s)` : "No Order of Merit events yet"}
            </AppText>

            {(!totals || totals.length === 0) ? (
              <EmptyState
                icon={<Feather name="award" size={24} color={colors.textMuted} />}
                title="No OOM points yet"
                message="Enter points for an Order of Merit event to see the standings."
              />
            ) : (
              <View style={{ gap: spacing.sm }}>
                {totals.map((row: any, idx: number) => (
                  <AppCard key={row.memberId ?? row.member_id ?? idx} style={styles.rowCard}>
                    <View style={styles.row}>
                      <AppText variant="body" style={{ width: 28, color: colors.textMuted }}>
                        {idx + 1}
                      </AppText>
                      <AppText variant="body" style={{ flex: 1 }}>
                        {row.memberName ?? row.member_name ?? row.initials ?? "Member"}
                      </AppText>
                      <AppText variant="body" style={{ width: 70, textAlign: "right" }}>
                        {row.totalPoints ?? row.total_points ?? row.points ?? 0} pts
                      </AppText>
                    </View>
                    <AppText variant="caption" color="secondary" style={{ marginTop: spacing.xs }}>
                      {row.eventsPlayed ?? row.events_played ?? 0} event(s)
                    </AppText>
                  </AppCard>
                ))}
              </View>
            )}
          </>
        )}

        {mode === "log" && (
          <>
            {(!groupedLog || groupedLog.length === 0) ? (
              <EmptyState
                icon={<Feather name="list" size={24} color={colors.textMuted} />}
                title="No results yet"
                message="Once points are saved for OOM events, the results log will appear here."
              />
            ) : (
              <View style={{ gap: spacing.md }}>
                {groupedLog.map((g) => (
                  <AppCard key={g.eventId} style={styles.eventCard}>
                    <AppText variant="h3" style={{ marginBottom: spacing.xs }}>
                      {g.eventName}
                    </AppText>
                    <AppText variant="caption" color="secondary" style={{ marginBottom: spacing.sm }}>
                      {(g.eventDate ? `${g.eventDate} · ` : "")}{g.format ? `${g.format}` : ""}
                    </AppText>

                    <View style={{ gap: spacing.xs }}>
                      {g.rows.map((r: any, i: number) => (
                        <View key={`${g.eventId}-${i}`} style={styles.logRow}>
                          <AppText variant="body" style={{ flex: 1 }}>
                            {r.memberName ?? r.member_name ?? "Member"}
                          </AppText>
                          <AppText variant="body" style={{ width: 70, textAlign: "right" }}>
                            {r.points ?? 0} pts
                          </AppText>
                        </View>
                      ))}
                    </View>
                  </AppCard>
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: "wrap",
  },
  rowCard: {
    padding: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  eventCard: {
    padding: spacing.md,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 4,
  },
});
