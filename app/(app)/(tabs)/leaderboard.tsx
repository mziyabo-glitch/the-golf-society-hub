/**
 * Order of Merit Dashboard
 * Glassmorphism design with podium, trend indicators, and accordion results log
 */

import { useCallback, useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Alert,
  Pressable,
  ScrollView,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Toast } from "@/components/ui/Toast";
import { useBootstrap } from "@/lib/useBootstrap";
import { getEventsBySocietyId, type EventDoc } from "@/lib/db_supabase/eventRepo";
import {
  getOrderOfMeritTotals,
  getOrderOfMeritLog,
  type OrderOfMeritEntry,
  type ResultsLogEntry,
} from "@/lib/db_supabase/resultsRepo";
import { getColors } from "@/lib/ui/theme";
import { exportOomPdf, exportOomResultsLogPdf } from "@/lib/pdf/oomPdf";
import { wrapExportErrors } from "@/lib/pdf/exportContract";


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
  const router = useRouter();
  const colors = getColors();

  const params = useLocalSearchParams<{ view?: string }>();
  const initialTab: TabType = params.view === "log" ? "resultsLog" : "leaderboard";

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [standings, setStandings] = useState<OrderOfMeritEntry[]>([]);
  const [resultsLog, setResultsLog] = useState<ResultsLogEntry[]>([]);
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" as const });

  // Track which events are expanded in the accordion
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

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

  const seasonLabel = useMemo(() => {
    const year = new Date().getFullYear();
    return `${year} Season • ${oomEventCount} event${oomEventCount !== 1 ? "s" : ""}`;
  }, [oomEventCount]);

  // Toggle event accordion expansion
  const toggleEventExpanded = useCallback((eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  // Format event date for display
  const formatEventDate = (dateStr: string | null): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    } catch {
      return "";
    }
  };

  // Share handlers
  const handleShareLeaderboard = async () => {
    if (standings.length === 0) {
      Alert.alert("No Data", "No standings to share.");
      return;
    }
    if (!societyId) {
      Alert.alert("Error", "Missing society ID.");
      return;
    }

    if (exporting) return;
    setExporting(true);
    try {
      console.log("[leaderboard] Export OOM leaderboard");
      await exportOomPdf(societyId);
      setToast({ visible: true, message: "Exported leaderboard PDF", type: "success" });
    } catch (err: any) {
      console.error("[leaderboard] Export failed", err);
      const failure = wrapExportErrors(err, "leaderboard PDF");
      const message = failure.detail ? `${failure.message} ${failure.detail}` : failure.message;
      setToast({ visible: true, message, type: "error" });
    } finally {
      setExporting(false);
    }
  };

  const handleShareResultsLog = async () => {
    if (resultsLog.length === 0) {
      Alert.alert("No Data", "No results to share.");
      return;
    }
    if (!societyId) {
      Alert.alert("Error", "Missing society ID.");
      return;
    }
    if (exporting) return;
    setExporting(true);
    try {
      console.log("[leaderboard] Export OOM results log");
      await exportOomResultsLogPdf(societyId);
      setToast({ visible: true, message: "Exported results log PDF", type: "success" });
    } catch (err: any) {
      console.error("[leaderboard] Export failed", err);
      const failure = wrapExportErrors(err, "results log PDF");
      const message = failure.detail ? `${failure.message} ${failure.detail}` : failure.message;
      setToast({ visible: true, message, type: "error" });
    } finally {
      setExporting(false);
    }
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
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
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
              style={({ pressed }) => [
                styles.shareButton,
                { opacity: exporting ? 0.5 : pressed ? 0.7 : 1 },
              ]}
              onPress={activeTab === "leaderboard" ? handleShareLeaderboard : handleShareResultsLog}
              disabled={exporting}
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
              <EmptyState
                icon={<Feather name="award" size={24} color={colors.textTertiary} />}
                title="No Order of Merit events yet"
                message="Create an OOM event to start tracking points."
                action={{
                  label: "Create OOM event",
                  onPress: () =>
                    router.push({
                      pathname: "/(app)/(tabs)/events",
                      params: { create: "1", classification: "oom" },
                    }),
                }}
                style={styles.emptyCard}
              />
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
                        <AppText style={styles.podiumName} numberOfLines={2}>
                          {top3[1]?.memberName}
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
                        <AppText style={styles.podiumName} numberOfLines={2}>
                          {top3[0]?.memberName}
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
                        <AppText style={styles.podiumName} numberOfLines={2}>
                          {top3[2]?.memberName}
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

                          <AppText style={styles.fieldName} numberOfLines={2}>
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
                        <AppText style={styles.fieldName} numberOfLines={2}>
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

        {/* ========== RESULTS LOG TAB (Accordion) ========== */}
        {activeTab === "resultsLog" && (
          <>
            {groupedResultsLog.length === 0 ? (
              <EmptyState
                icon={<Feather name="calendar" size={24} color={colors.textTertiary} />}
                title="No Order of Merit events yet"
                message="Create an OOM event to see the results log."
                action={{
                  label: "Create OOM event",
                  onPress: () =>
                    router.push({
                      pathname: "/(app)/(tabs)/events",
                      params: { create: "1", classification: "oom" },
                    }),
                }}
                style={styles.emptyCard}
              />
            ) : (
              <View style={styles.accordionContainer}>
                {groupedResultsLog.map((event, eventIdx) => {
                  const isExpanded = expandedEvents.has(event.eventId);
                  const eventNumber = groupedResultsLog.length - eventIdx;

                  return (
                    <GlassCard key={event.eventId} style={styles.accordionCard} elevated={isExpanded}>
                      {/* Accordion Header - Tappable */}
                      <Pressable
                        style={styles.accordionHeader}
                        onPress={() => toggleEventExpanded(event.eventId)}
                      >
                        <View style={styles.accordionEventInfo}>
                          <View style={styles.accordionEventBadge}>
                            <AppText style={styles.accordionEventNumber}>E{eventNumber}</AppText>
                          </View>
                          <View style={styles.accordionEventDetails}>
                            <AppText style={styles.accordionEventName} numberOfLines={1}>
                              {event.eventName}
                            </AppText>
                            <AppText style={styles.accordionEventMeta}>
                              {formatEventDate(event.eventDate)}
                              {event.format ? ` • ${event.format}` : ""}
                              {` • ${event.results.length} player${event.results.length !== 1 ? "s" : ""}`}
                            </AppText>
                          </View>
                        </View>
                        <View style={styles.accordionChevron}>
                          <Feather
                            name={isExpanded ? "chevron-up" : "chevron-down"}
                            size={20}
                            color="#9CA3AF"
                          />
                        </View>
                      </Pressable>

                      {/* Accordion Content - Event Leaderboard */}
                      {isExpanded && (
                        <View style={styles.accordionContent}>
                          {/* Column Headers */}
                          <View style={styles.accordionTableHeader}>
                            <AppText style={[styles.accordionColHeader, { width: 36 }]}>Pos</AppText>
                            <AppText style={[styles.accordionColHeader, { flex: 1 }]}>Player</AppText>
                            <AppText style={[styles.accordionColHeader, { width: 50, textAlign: "center" }]}>Score</AppText>
                            <AppText style={[styles.accordionColHeader, { width: 50, textAlign: "right" }]}>OOM</AppText>
                          </View>

                          {/* Player Rows */}
                          {event.results.map((result, resultIdx) => (
                            <View
                              key={result.memberId}
                              style={[
                                styles.accordionRow,
                                resultIdx === event.results.length - 1 && { borderBottomWidth: 0 },
                              ]}
                            >
                              <View style={styles.accordionPosition}>
                                {result.position && result.position <= 3 ? (
                                  <AppText style={styles.accordionPositionMedal}>
                                    {result.position === 1 ? "🥇" : result.position === 2 ? "🥈" : "🥉"}
                                  </AppText>
                                ) : (
                                  <AppText style={styles.accordionPositionText}>
                                    {result.position ?? "–"}
                                  </AppText>
                                )}
                              </View>
                              <AppText style={styles.accordionPlayerName} numberOfLines={2}>
                                {result.memberName}
                              </AppText>
                              <AppText style={styles.accordionScore}>
                                {result.dayValue ?? "–"}
                              </AppText>
                              <AppText style={styles.accordionPoints}>
                                {formatPoints(result.points)}
                              </AppText>
                            </View>
                          ))}
                        </View>
                      )}
                    </GlassCard>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* ========== FOOTER BRANDING ========== */}
        <View style={styles.footer}>
          <AppText style={styles.footerText}>Produced by</AppText>
          <AppText style={styles.footerBrand}>The Golf Society Hub</AppText>
        </View>
      </ScrollView>

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
    marginTop: 0,
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
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
    textAlign: "center",
    lineHeight: 16,
    minHeight: 32,
    paddingHorizontal: 4,
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
    paddingVertical: 14,
    minHeight: 48,
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
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    lineHeight: 20,
    paddingRight: 8,
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

  // Accordion (Results Log)
  accordionContainer: {
    gap: 12,
  },
  accordionCard: {
    padding: 0,
    overflow: "hidden",
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  accordionEventInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  accordionEventBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(11, 110, 79, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  accordionEventNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B6E4F",
  },
  accordionEventDetails: {
    flex: 1,
  },
  accordionEventName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  accordionEventMeta: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  accordionChevron: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    alignItems: "center",
    justifyContent: "center",
  },
  accordionContent: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.06)",
    backgroundColor: "rgba(249, 250, 251, 0.5)",
  },
  accordionTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.04)",
    backgroundColor: "rgba(0, 0, 0, 0.02)",
  },
  accordionColHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  accordionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.04)",
  },
  accordionPosition: {
    width: 36,
    alignItems: "center",
  },
  accordionPositionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  accordionPositionMedal: {
    fontSize: 16,
  },
  accordionPlayerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    paddingRight: 8,
  },
  accordionScore: {
    width: 50,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  accordionPoints: {
    width: 50,
    fontSize: 15,
    fontWeight: "700",
    color: "#0B6E4F",
    textAlign: "right",
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

});
