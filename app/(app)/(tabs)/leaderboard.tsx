import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { StyleSheet, View, Platform, Alert, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getEventsBySocietyId, type EventDoc } from "@/lib/db_supabase/eventRepo";
import {
  getOrderOfMeritTotals,
  getOrderOfMeritLog,
  type OrderOfMeritEntry,
  type ResultsLogEntry,
} from "@/lib/db_supabase/resultsRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import OOMShareCard, { type OOMShareRow } from "@/components/oom/OOMShareCard";

/**
 * Format OOM points for display
 * - Shows decimals only when needed (e.g., 16.5, not 25.00)
 * - Hides .00 for whole numbers (e.g., 25, not 25.00)
 */
function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) {
    return pts.toString();
  }
  // Show up to 2 decimal places, trimming trailing zeros
  return pts.toFixed(2).replace(/\.?0+$/, "");
}

type TabType = "leaderboard" | "resultsLog";

export default function LeaderboardScreen() {
  const { society, societyId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  // Read query param to determine initial view
  const params = useLocalSearchParams<{ view?: string }>();
  const initialTab: TabType = params.view === "log" ? "resultsLog" : "leaderboard";

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [standings, setStandings] = useState<OrderOfMeritEntry[]>([]);
  const [resultsLog, setResultsLog] = useState<ResultsLogEntry[]>([]);
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Ref for capturing the share card as an image
  const shareCardRef = useRef<View>(null);

  const loadData = useCallback(async () => {
    // Don't fetch with undefined societyId
    if (!societyId) {
      console.log("[leaderboard] No societyId, skipping fetch");
      setLoading(false);
      return;
    }

    console.log("[leaderboard] Loading data for society:", societyId);
    setLoading(true);
    setFetchError(null);

    try {
      const [totals, eventsData, logData] = await Promise.all([
        getOrderOfMeritTotals(societyId),
        getEventsBySocietyId(societyId),
        getOrderOfMeritLog(societyId),
      ]);
      console.log("[leaderboard] Data loaded:", {
        standings: totals.length,
        events: eventsData.length,
        resultsLog: logData.length,
      });
      setStandings(totals);
      setEvents(eventsData);
      setResultsLog(logData);
    } catch (err: any) {
      console.error("[leaderboard] Failed to load data:", err);
      setFetchError(err?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  // Group results log by event for display (audit trail)
  const groupedResultsLog = useMemo(() => {
    const groups: Array<{
      eventId: string;
      eventName: string;
      eventDate: string | null;
      format: string | null;
      results: Array<{
        memberId: string;
        memberName: string;
        points: number;
        dayValue: number | null;
        position: number | null;
      }>;
    }> = [];

    let currentEventId: string | null = null;

    for (const entry of resultsLog) {
      if (entry.eventId !== currentEventId) {
        groups.push({
          eventId: entry.eventId,
          eventName: entry.eventName,
          eventDate: entry.eventDate,
          format: entry.format,
          results: [],
        });
        currentEventId = entry.eventId;
      }
      groups[groups.length - 1].results.push({
        memberId: entry.memberId,
        memberName: entry.memberName,
        points: entry.points,
        dayValue: entry.dayValue,
        position: entry.position,
      });
    }

    return groups;
  }, [resultsLog]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update activeTab when view param changes (e.g., navigating from points save)
  useEffect(() => {
    if (params.view === "log") {
      setActiveTab("resultsLog");
    }
  }, [params.view]);

  // Refetch on focus to pick up changes after entering points
  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadData();
      }
    }, [societyId, loadData])
  );

  // Count OOM events with results (from the results log which is already filtered)
  const uniqueOOMEventIds = new Set(resultsLog.map((r) => r.eventId));
  const oomEventCount = uniqueOOMEventIds.size;

  // Prepare data for share card
  const shareCardRows: OOMShareRow[] = useMemo(() => {
    return standings.map((entry) => ({
      position: entry.rank,
      name: entry.memberName,
      points: entry.totalPoints,
    }));
  }, [standings]);

  // Season label for the share card
  const seasonLabel = useMemo(() => {
    const year = new Date().getFullYear();
    return `${year} Season - ${oomEventCount} event${oomEventCount !== 1 ? "s" : ""}`;
  }, [oomEventCount]);

  // Share as image using react-native-view-shot
  const handleShareImage = async () => {
    if (!shareCardRef.current) {
      Alert.alert("Error", "Share card not ready. Please try again.");
      return;
    }

    try {
      setSharing(true);

      // Capture the share card as an image
      const uri = await captureRef(shareCardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      console.log("[Leaderboard] Image captured:", uri);

      // Check if sharing is available
      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share Order of Merit",
          UTI: "public.png",
        });
      } else {
        Alert.alert(
          "Sharing Unavailable",
          "Sharing is not available on this device."
        );
      }
    } catch (err: any) {
      console.error("[Leaderboard] Share image error:", err);
      Alert.alert("Error", err?.message || "Failed to share leaderboard");
    } finally {
      setSharing(false);
    }
  };

  // Generate HTML for PDF
  const generateHTML = () => {
    const societyName = society?.name || "Golf Society";
    const date = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const rows = standings
      .map(
        (entry) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; font-weight: ${
          entry.rank <= 3 ? "bold" : "normal"
        }; color: ${entry.rank === 1 ? "#FFD700" : entry.rank === 2 ? "#C0C0C0" : entry.rank === 3 ? "#CD7F32" : "#333"};">
          ${entry.rank}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${entry.memberName}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${entry.eventsPlayed}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #0A7C4A;">${formatPoints(entry.totalPoints)}</td>
      </tr>
    `
      )
      .join("");

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Order of Merit - ${societyName}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 40px;
              color: #333;
            }
            h1 {
              color: #0A7C4A;
              margin-bottom: 8px;
            }
            h2 {
              color: #666;
              font-weight: normal;
              margin-top: 0;
            }
            .date {
              color: #999;
              margin-bottom: 24px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 16px;
            }
            th {
              background: #0A7C4A;
              color: white;
              padding: 12px;
              text-align: left;
            }
            th:first-child, th:last-child {
              text-align: center;
            }
            th:nth-child(3) {
              text-align: center;
            }
            .footer {
              margin-top: 32px;
              padding-top: 16px;
              border-top: 1px solid #eee;
              color: #999;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <h1>${societyName}</h1>
          <h2>Season Leaderboard - Order of Merit</h2>
          <p class="date">${date} | ${oomEventCount} Order of Merit event${oomEventCount !== 1 ? "s" : ""}</p>

          ${
            standings.length > 0
              ? `
            <table>
              <thead>
                <tr>
                  <th style="text-align: center;">Rank</th>
                  <th>Player</th>
                  <th style="text-align: center;">Events</th>
                  <th style="text-align: right;">Points</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          `
              : `<p>No Order of Merit results yet.</p>`
          }

          <div class="footer">
            Generated by Golf Society Hub
          </div>
        </body>
      </html>
    `;
  };

  const handleShare = async () => {
    try {
      setSharing(true);

      const html = generateHTML();

      // Generate PDF
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      console.log("[Leaderboard] PDF generated:", uri);

      // Check if sharing is available
      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Order of Merit",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert(
          "Sharing Unavailable",
          "Sharing is not available on this device."
        );
      }
    } catch (err: any) {
      console.error("[Leaderboard] Share error:", err);
      Alert.alert("Error", err?.message || "Failed to share leaderboard");
    } finally {
      setSharing(false);
    }
  };

  // Show loading state while bootstrap or data is loading
  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading Order of Merit..." />
        </View>
      </Screen>
    );
  }

  // Show error state if fetch failed
  if (fetchError) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="alert-circle" size={24} color={colors.error} />}
            title="Failed to Load"
            message={fetchError}
            action={{ label: "Try Again", onPress: loadData }}
          />
        </View>
      </Screen>
    );
  }

  // Show empty state if no society selected
  if (!societyId) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="users" size={24} color={colors.textTertiary} />}
            title="No Society Selected"
            message="Please select or join a golf society to view the Order of Merit."
          />
        </View>
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
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="title">Order of Merit</AppText>
          <AppText variant="caption" color="secondary">
            {activeTab === "leaderboard"
              ? `${oomEventCount} event${oomEventCount !== 1 ? "s" : ""} completed`
              : "Audit trail of Order of Merit points by event"}
          </AppText>
        </View>
        {activeTab === "leaderboard" && standings.length > 0 && (
          <SecondaryButton onPress={handleShareImage} size="sm" disabled={sharing}>
            <Feather name="share" size={16} color={colors.text} />
            {sharing ? " Sharing..." : " Share"}
          </SecondaryButton>
        )}
      </View>

      {/* Tab Toggle */}
      <View style={[styles.tabContainer, { backgroundColor: colors.backgroundSecondary }]}>
        <Pressable
          style={[
            styles.tab,
            activeTab === "leaderboard" && { backgroundColor: colors.background },
          ]}
          onPress={() => setActiveTab("leaderboard")}
        >
          <Feather
            name="award"
            size={14}
            color={activeTab === "leaderboard" ? colors.primary : colors.textSecondary}
          />
          <AppText
            variant="captionBold"
            color={activeTab === "leaderboard" ? "primary" : "secondary"}
          >
            Order of Merit
          </AppText>
        </Pressable>
        <Pressable
          style={[
            styles.tab,
            activeTab === "resultsLog" && { backgroundColor: colors.background },
          ]}
          onPress={() => setActiveTab("resultsLog")}
        >
          <Feather
            name="list"
            size={14}
            color={activeTab === "resultsLog" ? colors.primary : colors.textSecondary}
          />
          <AppText
            variant="captionBold"
            color={activeTab === "resultsLog" ? "primary" : "secondary"}
          >
            Results Log
          </AppText>
        </Pressable>
      </View>

      {/* Leaderboard Tab Content */}
      {activeTab === "leaderboard" && (
        <>
          {standings.length === 0 ? (
            <EmptyState
              icon={<Feather name="award" size={24} color={colors.textTertiary} />}
              title="No Order of Merit points yet"
              message="Create an OOM-classified event, add players, and enter scores to start the standings."
            />
          ) : (
            <View style={styles.list}>
              {standings.map((entry) => {
                const isTop3 = entry.rank <= 3;
                // Medal colors: gold (1st), silver (2nd), bronze (3rd)
                const medalColorMap: Record<number, string> = {
                  1: colors.warning,  // Gold
                  2: "#C0C0C0",       // Silver
                  3: "#CD7F32",       // Bronze
                };
                const medalColor = medalColorMap[entry.rank];

                return (
                  <AppCard key={entry.memberId} style={styles.standingCard}>
                    <View style={styles.standingRow}>
                      {/* Position */}
                      <View
                        style={[
                          styles.positionBadge,
                          {
                            backgroundColor: isTop3 && medalColor
                              ? medalColor + "20"
                              : colors.backgroundTertiary,
                          },
                        ]}
                      >
                        {isTop3 && medalColor ? (
                          <Feather
                            name="award"
                            size={16}
                            color={medalColor}
                          />
                        ) : (
                          <AppText variant="captionBold" color="secondary">
                            {entry.rank}
                          </AppText>
                        )}
                      </View>

                      {/* Member Info */}
                      <View style={styles.memberInfo}>
                        <AppText variant="bodyBold">{entry.memberName}</AppText>
                        <AppText variant="caption" color="secondary">
                          {entry.eventsPlayed} event{entry.eventsPlayed !== 1 ? "s" : ""}
                        </AppText>
                      </View>

                      {/* Points */}
                      <View style={styles.pointsContainer}>
                        <AppText variant="h1" color="primary">
                          {formatPoints(entry.totalPoints)}
                        </AppText>
                        <AppText variant="small" color="tertiary">
                          pts
                        </AppText>
                      </View>
                    </View>
                  </AppCard>
                );
              })}
            </View>
          )}

          {/* Info card */}
          <AppCard style={styles.infoCard}>
            <View style={styles.infoContent}>
              <Feather name="info" size={16} color={colors.textTertiary} />
              <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
                F1-style points (25, 18, 15, 12, 10, 8, 6, 4, 2, 1) for positions 1-10. Ties share averaged points. Only OOM events count.
              </AppText>
            </View>
          </AppCard>
        </>
      )}

      {/* Results Log Tab Content */}
      {activeTab === "resultsLog" && (
        <>
          {groupedResultsLog.length === 0 ? (
            <EmptyState
              icon={<Feather name="list" size={24} color={colors.textTertiary} />}
              title="No OOM results yet"
              message="Only OOM-classified events appear here. Create an OOM event and enter scores to see the audit trail."
            />
          ) : (
            <View style={styles.list}>
              {groupedResultsLog.map((group) => (
                <View key={group.eventId} style={styles.eventGroup}>
                  {/* Event Header */}
                  <View style={[styles.eventHeader, { backgroundColor: colors.backgroundSecondary }]}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyBold">{group.eventName}</AppText>
                      <View style={styles.eventMeta}>
                        {group.eventDate && (
                          <AppText variant="small" color="tertiary">
                            {formatDate(group.eventDate)}
                          </AppText>
                        )}
                        {group.format && (
                          <>
                            <AppText variant="small" color="tertiary"> • </AppText>
                            <AppText variant="small" color="tertiary">
                              {formatLabel(group.format)}
                            </AppText>
                          </>
                        )}
                      </View>
                    </View>
                    <View style={[styles.eventBadge, { backgroundColor: colors.primary + "20" }]}>
                      <AppText variant="small" color="primary">
                        {group.results.length} player{group.results.length !== 1 ? "s" : ""}
                      </AppText>
                    </View>
                  </View>

                  {/* Column Headers */}
                  <View style={[styles.resultHeaderRow, { borderBottomColor: colors.border }]}>
                    <AppText variant="captionBold" color="tertiary" style={{ flex: 1 }}>
                      Player
                    </AppText>
                    <AppText variant="captionBold" color="tertiary" style={styles.auditCol}>
                      {group.format?.includes('strokeplay') || group.format === 'medal' ? 'Net' : 'Points'}
                    </AppText>
                    <AppText variant="captionBold" color="tertiary" style={styles.auditCol}>
                      Pos
                    </AppText>
                    <AppText variant="captionBold" color="tertiary" style={styles.auditCol}>
                      OOM
                    </AppText>
                  </View>

                  {/* Results Rows */}
                  {group.results.map((result, idx) => (
                    <View
                      key={result.memberId}
                      style={[
                        styles.resultRow,
                        { borderBottomColor: colors.border },
                        idx === group.results.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <AppText variant="body" style={{ flex: 1 }} numberOfLines={1}>
                        {result.memberName}
                      </AppText>
                      <AppText variant="body" color="secondary" style={styles.auditCol}>
                        {result.dayValue ?? '-'}
                      </AppText>
                      <AppText variant="body" color="secondary" style={styles.auditCol}>
                        {result.position ?? '-'}
                      </AppText>
                      <AppText variant="bodyBold" color="primary" style={styles.auditCol}>
                        {formatPoints(result.points)}
                      </AppText>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* Info card for results log */}
          <AppCard style={styles.infoCard}>
            <View style={styles.infoContent}>
              <Feather name="info" size={16} color={colors.textTertiary} />
              <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
                Day Value shows the raw score entered. Position and OOM points are calculated automatically.
              </AppText>
            </View>
          </AppCard>
        </>
      )}

      {/* Off-screen share card for image capture */}
      <View style={styles.offScreen} pointerEvents="none">
        <OOMShareCard
          ref={shareCardRef}
          societyName={society?.name || "Golf Society"}
          seasonLabel={seasonLabel}
          rows={shareCardRows}
        />
      </View>
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
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  tabContainer: {
    flexDirection: "row",
    padding: spacing.xs,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  list: {
    gap: spacing.sm,
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
  eventGroup: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  resultHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  auditCol: {
    width: 50,
    textAlign: "center",
  },
  pointsBadge: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  infoCard: {
    marginTop: spacing.sm,
  },
  infoContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  offScreen: {
    position: "absolute",
    left: -9999,
    top: 0,
  },
});
