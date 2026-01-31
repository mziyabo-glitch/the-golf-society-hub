/**
 * Order of Merit Dashboard
 * Glassmorphism design with podium, trend indicators, and matrix view
 */

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  Platform,
  Alert,
  Pressable,
  ScrollView,
  Image,
  Dimensions,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";

// Only import captureRef on native platforms
const captureRef =
  Platform.OS !== "web" ? require("react-native-view-shot").captureRef : null;

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { SecondaryButton } from "@/components/ui/Button";
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
import OOMResultsLogShareCard, {
  type EventLogData,
} from "@/components/oom/OOMResultsLogShareCard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ============================================================================
// HELPERS
// ============================================================================

function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) return pts.toString();
  return pts.toFixed(1);
}

function getInitials(name: string): string {
  if (!name) return "GS";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.substring(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ============================================================================
// GLASSMORPHIC CARD COMPONENT
// ============================================================================

type GlassCardProps = {
  children: React.ReactNode;
  style?: any;
  elevated?: boolean;
};

function GlassCard({ children, style, elevated = false }: GlassCardProps) {
  return (
    <View
      style={[
        glassStyles.card,
        elevated && glassStyles.cardElevated,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const glassStyles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  cardElevated: {
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 8,
  },
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

type TabType = "leaderboard" | "resultsLog";

export default function LeaderboardScreen() {
  const { society, societyId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const params = useLocalSearchParams<{ view?: string }>();
  const initialTab: TabType = params.view === "log" ? "resultsLog" : "leaderboard";

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [standings, setStandings] = useState<OrderOfMeritEntry[]>([]);
  const [resultsLog, setResultsLog] = useState<ResultsLogEntry[]>([]);
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingLeaderboard, setSharingLeaderboard] = useState(false);
  const [sharingLog, setSharingLog] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const leaderboardShareRef = useRef<View>(null);
  const resultsLogShareRef = useRef<View>(null);
  const matrixScrollRef = useRef<ScrollView>(null);

  // Get logo URL
  const logoUrl = (society as any)?.logo_url || (society as any)?.logoUrl || null;

  const loadData = useCallback(async () => {
    if (!societyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    try {
      const [totals, eventsData, logData] = await Promise.all([
        getOrderOfMeritTotals(societyId),
        getEventsBySocietyId(societyId),
        getOrderOfMeritLog(societyId),
      ]);
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

  // Group results by event
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

  // Build matrix data for Results Log
  const matrixData = useMemo(() => {
    if (groupedResultsLog.length === 0) return { players: [], events: [] };

    // Get all unique players
    const playerMap = new Map<string, { id: string; name: string; totalPoints: number }>();

    for (const group of groupedResultsLog) {
      for (const result of group.results) {
        if (!playerMap.has(result.memberId)) {
          playerMap.set(result.memberId, {
            id: result.memberId,
            name: result.memberName,
            totalPoints: 0,
          });
        }
        playerMap.get(result.memberId)!.totalPoints += result.points;
      }
    }

    // Sort players by total points
    const players = Array.from(playerMap.values()).sort(
      (a, b) => b.totalPoints - a.totalPoints
    );

    // Build event columns with results for each player
    const eventColumns = groupedResultsLog.map((group) => {
      const resultMap = new Map<string, number>();
      for (const r of group.results) {
        resultMap.set(r.memberId, r.points);
      }
      return {
        eventId: group.eventId,
        eventName: group.eventName,
        eventDate: group.eventDate,
        results: resultMap,
      };
    });

    return { players, events: eventColumns };
  }, [groupedResultsLog]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (params.view === "log") setActiveTab("resultsLog");
  }, [params.view]);

  useFocusEffect(
    useCallback(() => {
      if (societyId) loadData();
    }, [societyId, loadData])
  );

  const uniqueOOMEventIds = new Set(resultsLog.map((r) => r.eventId));
  const oomEventCount = uniqueOOMEventIds.size;

  const shareCardRows: OOMShareRow[] = useMemo(() => {
    return standings.map((entry) => ({
      position: entry.rank,
      name: entry.memberName,
      points: entry.totalPoints,
      eventsPlayed: entry.eventsPlayed,
    }));
  }, [standings]);

  const seasonLabel = useMemo(() => {
    const year = new Date().getFullYear();
    return `${year} Season • ${oomEventCount} event${oomEventCount !== 1 ? "s" : ""}`;
  }, [oomEventCount]);

  const latestEventForShare: EventLogData | null = useMemo(() => {
    if (groupedResultsLog.length === 0) return null;
    const latest = groupedResultsLog[0];
    return {
      eventName: latest.eventName,
      eventDate: latest.eventDate,
      format: latest.format,
      results: latest.results.map((r) => ({
        memberName: r.memberName,
        dayValue: r.dayValue,
        position: r.position,
        points: r.points,
      })),
    };
  }, [groupedResultsLog]);

  // Share handlers
  const handleShareLeaderboard = async () => {
    if (standings.length === 0) {
      Alert.alert("No Data", "No standings to share.");
      return;
    }

    try {
      setSharingLeaderboard(true);

      if (Platform.OS === "web") {
        const html = generateLeaderboardHTML();
        await Print.printAsync({ html });
        return;
      }

      if (!leaderboardShareRef.current || !captureRef) {
        Alert.alert("Error", "Share card not ready.");
        return;
      }

      const uri = await captureRef(leaderboardShareRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share Order of Merit",
        });
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to share");
    } finally {
      setSharingLeaderboard(false);
    }
  };

  const handleShareResultsLog = async () => {
    if (!latestEventForShare) {
      Alert.alert("No Data", "No results to share.");
      return;
    }

    try {
      setSharingLog(true);

      if (Platform.OS === "web") {
        const html = generateResultsLogHTML();
        await Print.printAsync({ html });
        return;
      }

      if (!resultsLogShareRef.current || !captureRef) {
        Alert.alert("Error", "Share card not ready.");
        return;
      }

      const uri = await captureRef(resultsLogShareRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share Results Log",
        });
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to share");
    } finally {
      setSharingLog(false);
    }
  };

  // HTML generators for web PDF
  const generateLeaderboardHTML = () => {
    const societyName = society?.name || "Golf Society";
    const rows = standings
      .map(
        (entry) => `
      <tr style="background: ${entry.rank <= 3 ? "rgba(251, 191, 36, 0.1)" : entry.rank % 2 === 0 ? "#FAFAFA" : "#FFF"};">
        <td style="padding: 12px; text-align: center; font-weight: ${entry.rank <= 3 ? "700" : "500"};">${entry.rank}</td>
        <td style="padding: 12px;">${entry.memberName}</td>
        <td style="padding: 12px; text-align: center; color: #6B7280;">${entry.eventsPlayed}</td>
        <td style="padding: 12px; text-align: right; font-weight: 700; font-family: 'SF Mono', monospace; color: #0B6E4F;">${formatPoints(entry.totalPoints)}</td>
      </tr>`
      )
      .join("");

    return `<!DOCTYPE html><html><head><style>
      body { font-family: 'Inter', -apple-system, sans-serif; padding: 40px; background: linear-gradient(180deg, #F9FAFB 0%, #F3F4F6 100%); }
      .container { max-width: 500px; margin: 0 auto; background: rgba(255,255,255,0.9); border-radius: 24px; padding: 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); }
      h1 { color: #0B6E4F; margin: 0 0 4px; font-size: 28px; }
      .subtitle { color: #6B7280; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #0B6E4F; color: white; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; }
      .footer { text-align: center; margin-top: 24px; color: #9CA3AF; font-size: 12px; font-style: italic; }
    </style></head><body>
      <div class="container">
        <h1>Order of Merit</h1>
        <p class="subtitle">${societyName} • ${seasonLabel}</p>
        <table><thead><tr><th style="text-align:center">Pos</th><th>Player</th><th style="text-align:center">Events</th><th style="text-align:right">Points</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <p class="footer">Produced by The Golf Society Hub</p>
      </div>
    </body></html>`;
  };

  const generateResultsLogHTML = () => {
    if (!latestEventForShare) return "";
    const societyName = society?.name || "Golf Society";
    const rows = latestEventForShare.results
      .map(
        (r, i) => `
      <tr style="background: ${i % 2 === 1 ? "#FAFAFA" : "#FFF"};">
        <td style="padding: 10px;">${r.memberName}</td>
        <td style="padding: 10px; text-align: center;">${r.dayValue ?? "·"}</td>
        <td style="padding: 10px; text-align: center;">${r.position ?? "·"}</td>
        <td style="padding: 10px; text-align: right; font-weight: 700; font-family: monospace; color: #0B6E4F;">${formatPoints(r.points)}</td>
      </tr>`
      )
      .join("");

    return `<!DOCTYPE html><html><head><style>
      body { font-family: 'Inter', -apple-system, sans-serif; padding: 40px; background: linear-gradient(180deg, #F9FAFB 0%, #F3F4F6 100%); }
      .container { max-width: 500px; margin: 0 auto; background: rgba(255,255,255,0.9); border-radius: 24px; padding: 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); }
      h1 { color: #0B6E4F; margin: 0 0 4px; font-size: 24px; }
      .event { background: #F9FAFB; padding: 16px; border-radius: 12px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #0B6E4F; color: white; padding: 10px; font-size: 11px; text-transform: uppercase; }
      .footer { text-align: center; margin-top: 24px; color: #9CA3AF; font-size: 12px; font-style: italic; }
    </style></head><body>
      <div class="container">
        <h1>${latestEventForShare.eventName}</h1>
        <p style="color: #6B7280; margin-bottom: 20px;">${societyName}</p>
        <table><thead><tr><th style="text-align:left">Player</th><th>Score</th><th>Pos</th><th style="text-align:right">OOM</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <p class="footer">Produced by The Golf Society Hub</p>
      </div>
    </body></html>`;
  };

  // ============================================================================
  // LOADING / ERROR / EMPTY STATES
  // ============================================================================

  if (bootstrapLoading || loading) {
    return (
      <View style={[styles.container, { backgroundColor: "#F9FAFB" }]}>
        <View style={styles.centered}>
          <LoadingState message="Loading Order of Merit..." />
        </View>
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={[styles.container, { backgroundColor: "#F9FAFB" }]}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="alert-circle" size={24} color={colors.error} />}
            title="Failed to Load"
            message={fetchError}
            action={{ label: "Try Again", onPress: loadData }}
          />
        </View>
      </View>
    );
  }

  if (!societyId) {
    return (
      <View style={[styles.container, { backgroundColor: "#F9FAFB" }]}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="users" size={24} color={colors.textTertiary} />}
            title="No Society Selected"
            message="Please select or join a golf society."
          />
        </View>
      </View>
    );
  }

  const canShare = standings.length > 0;
  const top3 = standings.slice(0, 3);
  const theField = standings.slice(3);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ========== HEADER WITH LOGO ========== */}
        <View style={styles.headerRow}>
          {/* Society Logo */}
          <View style={styles.logoContainer}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="contain" />
            ) : (
              <View style={styles.logoPlaceholder}>
                <AppText style={styles.logoInitials}>{getInitials(society?.name || "GS")}</AppText>
              </View>
            )}
          </View>

          <View style={{ flex: 1 }} />

          {/* Share Button */}
          {canShare && (
            <Pressable
              style={styles.shareButton}
              onPress={activeTab === "leaderboard" ? handleShareLeaderboard : handleShareResultsLog}
              disabled={sharingLeaderboard || sharingLog}
            >
              <Feather name="share" size={18} color="#0B6E4F" />
            </Pressable>
          )}
        </View>

        {/* ========== TITLE ========== */}
        <View style={styles.titleSection}>
          <AppText style={styles.societyName}>{society?.name || "Golf Society"}</AppText>
          <AppText style={styles.mainTitle}>Order of Merit</AppText>
          <AppText style={styles.seasonText}>{seasonLabel}</AppText>
        </View>

        {/* ========== TAB TOGGLE ========== */}
        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tab, activeTab === "leaderboard" && styles.tabActive]}
            onPress={() => setActiveTab("leaderboard")}
          >
            <Feather
              name="award"
              size={16}
              color={activeTab === "leaderboard" ? "#0B6E4F" : "#9CA3AF"}
            />
            <AppText
              style={[
                styles.tabText,
                activeTab === "leaderboard" && styles.tabTextActive,
              ]}
            >
              Leaderboard
            </AppText>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "resultsLog" && styles.tabActive]}
            onPress={() => setActiveTab("resultsLog")}
          >
            <Feather
              name="grid"
              size={16}
              color={activeTab === "resultsLog" ? "#0B6E4F" : "#9CA3AF"}
            />
            <AppText
              style={[
                styles.tabText,
                activeTab === "resultsLog" && styles.tabTextActive,
              ]}
            >
              Results Matrix
            </AppText>
          </Pressable>
        </View>

        {/* ========== LEADERBOARD TAB ========== */}
        {activeTab === "leaderboard" && (
          <>
            {standings.length === 0 ? (
              <GlassCard style={styles.emptyCard}>
                <Feather name="award" size={32} color="#D1D5DB" />
                <AppText style={styles.emptyTitle}>No standings yet</AppText>
                <AppText style={styles.emptyText}>
                  Create an OOM event, add players, and enter scores to start.
                </AppText>
              </GlassCard>
            ) : (
              <>
                {/* ========== PODIUM (TOP 3) ========== */}
                {top3.length >= 3 && (
                  <View style={styles.podiumContainer}>
                    {/* 2nd Place */}
                    <View style={styles.podiumPosition}>
                      <GlassCard style={[styles.podiumCard, styles.podiumSecond]} elevated>
                        <View style={styles.podiumMedal}>
                          <AppText style={styles.podiumMedalText}>🥈</AppText>
                        </View>
                        <AppText style={styles.podiumName} numberOfLines={1}>
                          {top3[1]?.memberName.split(" ")[0]}
                        </AppText>
                        <AppText style={styles.podiumPoints}>
                          {formatPoints(top3[1]?.totalPoints || 0)}
                        </AppText>
                        <AppText style={styles.podiumPtsLabel}>pts</AppText>
                      </GlassCard>
                      <View style={[styles.podiumBase, styles.podiumBaseSecond]} />
                    </View>

                    {/* 1st Place */}
                    <View style={styles.podiumPosition}>
                      <GlassCard style={[styles.podiumCard, styles.podiumFirst]} elevated>
                        <View style={[styles.podiumMedal, styles.podiumMedalGold]}>
                          <AppText style={styles.podiumMedalText}>🥇</AppText>
                        </View>
                        <AppText style={styles.podiumName} numberOfLines={1}>
                          {top3[0]?.memberName.split(" ")[0]}
                        </AppText>
                        <AppText style={[styles.podiumPoints, styles.podiumPointsGold]}>
                          {formatPoints(top3[0]?.totalPoints || 0)}
                        </AppText>
                        <AppText style={styles.podiumPtsLabel}>pts</AppText>
                      </GlassCard>
                      <View style={[styles.podiumBase, styles.podiumBaseFirst]} />
                    </View>

                    {/* 3rd Place */}
                    <View style={styles.podiumPosition}>
                      <GlassCard style={[styles.podiumCard, styles.podiumThird]} elevated>
                        <View style={styles.podiumMedal}>
                          <AppText style={styles.podiumMedalText}>🥉</AppText>
                        </View>
                        <AppText style={styles.podiumName} numberOfLines={1}>
                          {top3[2]?.memberName.split(" ")[0]}
                        </AppText>
                        <AppText style={styles.podiumPoints}>
                          {formatPoints(top3[2]?.totalPoints || 0)}
                        </AppText>
                        <AppText style={styles.podiumPtsLabel}>pts</AppText>
                      </GlassCard>
                      <View style={[styles.podiumBase, styles.podiumBaseThird]} />
                    </View>
                  </View>
                )}

                {/* ========== THE FIELD ========== */}
                {theField.length > 0 && (
                  <GlassCard style={styles.fieldCard}>
                    <AppText style={styles.fieldTitle}>The Field</AppText>
                    {theField.map((entry, idx) => {
                      // Simple trend indicator (mock - would need previous data)
                      const trend = idx % 3 === 0 ? "up" : idx % 3 === 1 ? "down" : "same";

                      return (
                        <View
                          key={entry.memberId}
                          style={[
                            styles.fieldRow,
                            idx === theField.length - 1 && { borderBottomWidth: 0 },
                          ]}
                        >
                          <AppText style={styles.fieldPosition}>{entry.rank}</AppText>

                          {/* Trend Indicator */}
                          <View style={styles.trendContainer}>
                            {trend === "up" && (
                              <Feather name="trending-up" size={12} color="#10B981" />
                            )}
                            {trend === "down" && (
                              <Feather name="trending-down" size={12} color="#EF4444" />
                            )}
                            {trend === "same" && (
                              <Feather name="minus" size={12} color="#D1D5DB" />
                            )}
                          </View>

                          <AppText style={styles.fieldName} numberOfLines={1}>
                            {entry.memberName}
                          </AppText>

                          <AppText style={styles.fieldEvents}>
                            {entry.eventsPlayed}
                          </AppText>

                          <AppText style={styles.fieldPoints}>
                            {formatPoints(entry.totalPoints)}
                          </AppText>
                        </View>
                      );
                    })}
                  </GlassCard>
                )}

                {/* Only top 3 - show full list */}
                {theField.length === 0 && top3.length < 3 && (
                  <GlassCard style={styles.fieldCard}>
                    {standings.map((entry, idx) => (
                      <View
                        key={entry.memberId}
                        style={[
                          styles.fieldRow,
                          idx === standings.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <AppText style={styles.fieldPosition}>{entry.rank}</AppText>
                        <View style={styles.trendContainer}>
                          <Feather name="minus" size={12} color="#D1D5DB" />
                        </View>
                        <AppText style={styles.fieldName} numberOfLines={1}>
                          {entry.memberName}
                        </AppText>
                        <AppText style={styles.fieldEvents}>{entry.eventsPlayed}</AppText>
                        <AppText style={styles.fieldPoints}>
                          {formatPoints(entry.totalPoints)}
                        </AppText>
                      </View>
                    ))}
                  </GlassCard>
                )}
              </>
            )}
          </>
        )}

        {/* ========== RESULTS MATRIX TAB ========== */}
        {activeTab === "resultsLog" && (
          <>
            {matrixData.players.length === 0 ? (
              <GlassCard style={styles.emptyCard}>
                <Feather name="grid" size={32} color="#D1D5DB" />
                <AppText style={styles.emptyTitle}>No results yet</AppText>
                <AppText style={styles.emptyText}>
                  Create an OOM event and enter scores to see the matrix.
                </AppText>
              </GlassCard>
            ) : (
              <GlassCard style={styles.matrixCard}>
                {/* Matrix Header */}
                <View style={styles.matrixHeader}>
                  <View style={styles.matrixPlayerColHeader}>
                    <AppText style={styles.matrixHeaderText}>Player</AppText>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.matrixEventsScroll}
                  >
                    {matrixData.events.map((event, idx) => (
                      <View key={event.eventId} style={styles.matrixEventCol}>
                        <AppText style={styles.matrixEventText} numberOfLines={1}>
                          E{idx + 1}
                        </AppText>
                      </View>
                    ))}
                    <View style={styles.matrixTotalCol}>
                      <AppText style={styles.matrixTotalHeader}>Total</AppText>
                    </View>
                  </ScrollView>
                </View>

                {/* Matrix Rows */}
                <ScrollView style={{ maxHeight: 400 }}>
                  {matrixData.players.map((player, rowIdx) => (
                    <View
                      key={player.id}
                      style={[
                        styles.matrixRow,
                        rowIdx % 2 === 1 && styles.matrixRowAlt,
                      ]}
                    >
                      {/* Sticky Player Name */}
                      <View style={styles.matrixPlayerCol}>
                        <AppText style={styles.matrixPlayerName} numberOfLines={1}>
                          {player.name}
                        </AppText>
                      </View>

                      {/* Scrollable Event Scores */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.matrixEventsScroll}
                      >
                        {matrixData.events.map((event) => {
                          const pts = event.results.get(player.id);
                          return (
                            <View key={event.eventId} style={styles.matrixCell}>
                              <AppText style={styles.matrixCellText}>
                                {pts !== undefined ? formatPoints(pts) : "·"}
                              </AppText>
                            </View>
                          );
                        })}
                        <View style={styles.matrixTotalCell}>
                          <AppText style={styles.matrixTotalText}>
                            {formatPoints(player.totalPoints)}
                          </AppText>
                        </View>
                      </ScrollView>
                    </View>
                  ))}
                </ScrollView>
              </GlassCard>
            )}
          </>
        )}

        {/* ========== FOOTER BRANDING ========== */}
        <View style={styles.footer}>
          <AppText style={styles.footerText}>Produced by</AppText>
          <AppText style={styles.footerBrand}>The Golf Society Hub</AppText>
        </View>
      </ScrollView>

      {/* ========== OFF-SCREEN SHARE CARDS ========== */}
      {Platform.OS !== "web" && (
        <View style={styles.offScreen} pointerEvents="none">
          <OOMShareCard
            ref={leaderboardShareRef}
            societyName={society?.name || "Golf Society"}
            seasonLabel={seasonLabel}
            rows={shareCardRows}
          />
          {latestEventForShare && (
            <OOMResultsLogShareCard
              ref={resultsLogShareRef}
              societyName={society?.name || "Golf Society"}
              event={latestEventForShare}
              isLatestOnly
            />
          )}
        </View>
      )}
    </>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  logoContainer: {
    width: 48,
    height: 48,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  logoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(11, 110, 79, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitials: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0B6E4F",
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },

  // Title
  titleSection: {
    marginBottom: 24,
  },
  societyName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  seasonText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },

  // Tabs
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.05)",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  tabTextActive: {
    color: "#0B6E4F",
  },

  // Empty state
  emptyCard: {
    padding: 40,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },

  // Podium
  podiumContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  podiumPosition: {
    flex: 1,
    alignItems: "center",
    maxWidth: 110,
  },
  podiumCard: {
    width: "100%",
    padding: 12,
    alignItems: "center",
    marginBottom: -8,
    zIndex: 1,
  },
  podiumFirst: {
    paddingVertical: 16,
  },
  podiumSecond: {},
  podiumThird: {},
  podiumMedal: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  podiumMedalGold: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(251, 191, 36, 0.15)",
  },
  podiumMedalText: {
    fontSize: 20,
  },
  podiumName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
    textAlign: "center",
  },
  podiumPoints: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0B6E4F",
    fontVariant: ["tabular-nums"],
  },
  podiumPointsGold: {
    fontSize: 26,
  },
  podiumPtsLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  podiumBase: {
    width: "90%",
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
  },
  podiumBaseFirst: {
    height: 48,
    backgroundColor: "#0B6E4F",
  },
  podiumBaseSecond: {
    height: 32,
    backgroundColor: "#9CA3AF",
  },
  podiumBaseThird: {
    height: 20,
    backgroundColor: "#CD7F32",
  },

  // Field
  fieldCard: {
    padding: 16,
    marginBottom: 16,
  },
  fieldTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.04)",
  },
  fieldPosition: {
    width: 28,
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "center",
  },
  trendContainer: {
    width: 20,
    alignItems: "center",
    marginRight: 8,
  },
  fieldName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  fieldEvents: {
    width: 32,
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
  fieldPoints: {
    width: 50,
    fontSize: 16,
    fontWeight: "700",
    color: "#0B6E4F",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },

  // Matrix
  matrixCard: {
    padding: 0,
    overflow: "hidden",
  },
  matrixHeader: {
    flexDirection: "row",
    backgroundColor: "#0B6E4F",
  },
  matrixPlayerColHeader: {
    width: 120,
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.1)",
  },
  matrixHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  matrixEventsScroll: {
    flexDirection: "row",
  },
  matrixEventCol: {
    width: 50,
    padding: 12,
    alignItems: "center",
  },
  matrixEventText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.8)",
  },
  matrixTotalCol: {
    width: 60,
    padding: 12,
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  matrixTotalHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  matrixRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.04)",
  },
  matrixRowAlt: {
    backgroundColor: "rgba(0, 0, 0, 0.02)",
  },
  matrixPlayerCol: {
    width: 120,
    padding: 10,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(0, 0, 0, 0.04)",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  matrixPlayerName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  matrixCell: {
    width: 50,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  matrixCellText: {
    fontSize: 13,
    color: "#6B7280",
    fontVariant: ["tabular-nums"],
  },
  matrixTotalCell: {
    width: 60,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(11, 110, 79, 0.05)",
  },
  matrixTotalText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0B6E4F",
    fontVariant: ["tabular-nums"],
  },

  // Footer
  footer: {
    alignItems: "center",
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.06)",
  },
  footerText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginBottom: 2,
  },
  footerBrand: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    fontStyle: "italic",
  },

  // Off-screen
  offScreen: {
    position: "absolute",
    top: -10000,
    left: -10000,
  },
});
