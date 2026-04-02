/**
 * Order of Merit Dashboard
 * Glassmorphism design with podium, trend indicators, and accordion results log
 */

import { useCallback, useContext, useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { SocietyLogoImage } from "@/components/ui/SocietyLogoImage";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Toast } from "@/components/ui/Toast";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import { getEventsBySocietyId } from "@/lib/db_supabase/eventRepo";
import {
  getOrderOfMeritTotals,
  getOrderOfMeritLog,
  type OrderOfMeritEntry,
  type ResultsLogEntry,
} from "@/lib/db_supabase/resultsRepo";
import { getColors, premiumTokens, spacing, type TypographyTokens } from "@/lib/ui/theme";
import { useScaledTypography } from "@/lib/ui/fontScaleContext";
import { getSocietyLogoUrl } from "@/lib/societyLogo";
import { exportOomPdf, exportOomResultsLogPdf } from "@/lib/pdf/oomPdf";


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
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: premiumTokens.cardBorder,
    ...premiumTokens.cardShadow,
  },
  cardElevated: {
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 5,
  },
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

type TabType = "leaderboard" | "resultsLog" | "honour";

export default function LeaderboardScreen() {
  const scaledTypography = useScaledTypography();
  const colors = getColors();
  const styles = useMemo(() => makeLeaderboardStyles(scaledTypography, colors), [scaledTypography, colors]);

  const { society, societyId, loading: bootstrapLoading } = useBootstrap();
  const { needsLicence, guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();
  const router = useRouter();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const { width: screenWidth } = useWindowDimensions();
  const logoSize = screenWidth < 600 ? 72 : 64;

  const params = useLocalSearchParams<{ view?: string }>();
  const initialTab: TabType =
    params.view === "log" ? "resultsLog" : params.view === "honour" ? "honour" : "leaderboard";

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [standings, setStandings] = useState<OrderOfMeritEntry[]>([]);
  const [resultsLog, setResultsLog] = useState<ResultsLogEntry[]>([]);
  // Events are fetched in loadData but only used implicitly via standings/log
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });
  /** In-app share format picker (Alert is unreliable on web / can leave `exporting` stuck). */
  const [shareTarget, setShareTarget] = useState<null | "leaderboard" | "matrix">(null);

  // Track which events are expanded in the accordion
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Get logo URL
  const logoUrl = getSocietyLogoUrl(society);

  const loadData = useCallback(async () => {
    if (!societyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    try {
      const [totals, , logData] = await Promise.all([
        getOrderOfMeritTotals(societyId),
        getEventsBySocietyId(societyId),
        getOrderOfMeritLog(societyId),
      ]);
      setStandings(totals);
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
    const groups: {
      eventId: string;
      eventName: string;
      eventDate: string | null;
      format: string | null;
      results: {
        memberId: string;
        memberName: string;
        points: number;
        dayValue: number | null;
        position: number | null;
      }[];
    }[] = [];

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
      const bucket = groups[groups.length - 1].results;
      if (bucket.some((r) => r.memberId === entry.memberId)) {
        if (__DEV__) {
          console.warn("[oom-matrix-debug] skipped duplicate member row in UI group", {
            eventId: entry.eventId,
            memberId: entry.memberId,
            memberName: entry.memberName,
          });
        }
        continue;
      }
      bucket.push({
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
    if (params.view === "honour") router.replace("/(app)/roll-of-honour");
  }, [params.view, router]);

  useFocusEffect(
    useCallback(() => {
      if (societyId) loadData();
      setExporting(false);
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

  const handleSharePress = () => {
    if (!guardPaidAction()) return;
    if (!societyId) {
      setToast({ visible: true, message: "Missing society — try again after refresh.", type: "error" });
      return;
    }
    if (activeTab === "leaderboard") {
      if (standings.length === 0) {
        setToast({ visible: true, message: "No standings to share yet.", type: "info" });
        return;
      }
      setShareTarget("leaderboard");
      return;
    }
    if (activeTab === "resultsLog") {
      if (resultsLog.length === 0) {
        setToast({ visible: true, message: "No matrix results to share yet.", type: "info" });
        return;
      }
      setShareTarget("matrix");
    }
  };

  const closeShareSheet = () => {
    if (!exporting) setShareTarget(null);
  };

  const runSharePng = () => {
    if (!societyId || !shareTarget) return;
    const kind = shareTarget;
    setShareTarget(null);
    if (kind === "leaderboard") {
      router.push({ pathname: "/(share)/oom-share", params: { societyId, view: "leaderboard" } });
    } else {
      router.push({ pathname: "/(share)/oom-share", params: { societyId, view: "log" } });
    }
  };

  const runSharePdf = async () => {
    if (!societyId || !shareTarget) return;
    const kind = shareTarget;
    setShareTarget(null);
    setExporting(true);
    try {
      if (kind === "leaderboard") {
        await exportOomPdf(societyId);
      } else {
        await exportOomResultsLogPdf(societyId);
      }
    } catch (e: any) {
      setToast({
        visible: true,
        message: e?.message ?? "Couldn't create PDF. Try again.",
        type: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  // ============================================================================
  // LOADING / ERROR / EMPTY STATES
  // ============================================================================

  if (bootstrapLoading || loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <LoadingState message="Loading standings and results matrix…" />
        </View>
      </SafeAreaView>
    );
  }

  if (fetchError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="alert-circle" size={24} color={colors.error} />}
            title="Failed to Load"
            message={fetchError}
            action={{ label: "Try Again", onPress: loadData }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!societyId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="users" size={24} color={colors.textTertiary} />}
            title="No Society Selected"
            message="Please select or join a golf society."
          />
        </View>
      </SafeAreaView>
    );
  }

  const canShare = standings.length > 0 && !needsLicence;
  const top3 = standings.slice(0, 3);
  const theField = standings.slice(3);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 16, paddingBottom: tabBarHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ========== HEADER WITH LOGO ========== */}
        <View style={styles.headerRow}>
          <SocietyLogoImage
            logoUrl={logoUrl}
            size={logoSize}
            variant="hero"
            placeholderText={getInitials(society?.name || "GS")}
          />

          <View style={{ flex: 1 }} />

          {/* Share Button */}
          {canShare && (
            <Pressable
              style={({ pressed }) => [
                styles.shareButton,
                { opacity: exporting ? 0.5 : pressed ? 0.7 : 1 },
              ]}
              onPress={handleSharePress}
              disabled={exporting}
            >
              <Feather name="share" size={18} color={colors.primary} />
            </Pressable>
          )}
        </View>

        {/* Header: Order of Merit 26 bold, meta 12 secondary */}
        <View style={styles.titleSection}>
          <AppText style={styles.mainTitle}>Order of Merit</AppText>
          <AppText style={styles.seasonText}>{seasonLabel}</AppText>
          {!needsLicence ? (
            <AppText style={styles.tabHint}>
              {activeTab === "leaderboard"
                ? "Season standings"
                : activeTab === "resultsLog"
                  ? "Per-event scores and OOM points"
                  : ""}
            </AppText>
          ) : null}
        </View>

        {/* SegmentedTabs: Leaderboard / Results Matrix / Roll of Honour */}
        {!needsLicence && (
          <SegmentedTabs
            items={[
              {
                id: "leaderboard" as TabType,
                label: "Leaders",
                icon: (
                  <Feather name="bar-chart-2" size={15} color={activeTab === "leaderboard" ? colors.primary : colors.textTertiary} />
                ),
              },
              {
                id: "resultsLog" as TabType,
                label: "Matrix",
                icon: <Feather name="grid" size={15} color={activeTab === "resultsLog" ? colors.primary : colors.textTertiary} />,
              },
              {
                id: "honour" as TabType,
                label: "Honour",
                icon: <Feather name="award" size={15} color={colors.textTertiary} />,
              },
            ]}
            selectedId={activeTab}
            onSelect={(id) => {
              if (id === "honour") {
                router.push("/(app)/roll-of-honour");
              } else {
                setActiveTab(id);
              }
            }}
          />
        )}

        {/* ========== LEADERBOARD TAB ========== */}
        {activeTab === "leaderboard" && (
          <>
            {standings.length === 0 ? (
              <EmptyState
                icon={<Feather name="award" size={32} color={colors.textTertiary} />}
                title="No Order of Merit yet"
                message="When you run OOM events and save results, standings and the matrix will appear here."
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

                {/* ========== LICENCE CTA (unlicensed) ========== */}
                {needsLicence && standings.length > 0 && (
                  <GlassCard style={[styles.fieldCard, { alignItems: "center", paddingVertical: 24 }]}>
                    <Feather name="lock" size={24} color={colors.textTertiary} style={{ marginBottom: 8 }} />
                    <AppText style={[styles.fieldTitle, { textAlign: "center", marginBottom: 4 }]}>
                      Full leaderboard
                    </AppText>
                    <AppText variant="body" color="secondary" style={{ textAlign: "center", marginBottom: 16 }}>
                      Get a licence to see the full standings and results matrix.
                    </AppText>
                    <PrimaryButton onPress={() => setModalVisible(true)} size="sm">
                      Unlock full leaderboard
                    </PrimaryButton>
                  </GlassCard>
                )}

                {/* ========== THE FIELD ========== */}
                {!needsLicence && theField.length > 0 && (
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
                              <Feather name="trending-up" size={12} color={colors.success} />
                            )}
                            {trend === "down" && (
                              <Feather name="trending-down" size={12} color={colors.error} />
                            )}
                            {trend === "same" && (
                              <Feather name="minus" size={12} color={colors.divider} />
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
                {!needsLicence && theField.length === 0 && top3.length < 3 && (
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
                          <Feather name="minus" size={12} color={colors.divider} />
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

        {/* ========== RESULTS LOG TAB (Accordion — licensed only) ========== */}
        {!needsLicence && activeTab === "resultsLog" && (
          <>
            {groupedResultsLog.length === 0 ? (
              <EmptyState
                icon={<Feather name="calendar" size={32} color={colors.textTertiary} />}
                title="No results in the matrix yet"
                message="Saved scores from Order of Merit events will show here, grouped by round."
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
                            color={colors.textTertiary}
                          />
                        </View>
                      </Pressable>

                      {/* Accordion Content - Event Leaderboard */}
                      {isExpanded && (
                        <View style={styles.accordionContent}>
                          {/* Column Headers */}
                          <View style={styles.accordionTableHeader}>
                            <AppText style={[styles.accordionColHeader, styles.accordionColPos]}>Pos</AppText>
                            <AppText style={[styles.accordionColHeader, styles.accordionColPlayer]}>Player</AppText>
                            <AppText style={[styles.accordionColHeader, styles.accordionColScore]}>Score</AppText>
                            <AppText style={[styles.accordionColHeader, styles.accordionColOom]}>OOM</AppText>
                          </View>

                          {/* Player Rows */}
                          {event.results.map((result, resultIdx) => (
                            <View
                              key={result.memberId}
                              style={[
                                styles.accordionRow,
                                resultIdx % 2 === 1 && styles.accordionRowAlt,
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

        {/* Subtle footer */}
        <View style={styles.footer}>
          <AppText style={styles.footerText}>The Golf Society Hub</AppText>
        </View>
      </ScrollView>

      <Modal
        visible={shareTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={closeShareSheet}
      >
        <View style={styles.shareModalRoot}>
          <Pressable
            style={styles.shareModalBackdrop}
            onPress={closeShareSheet}
            accessibilityLabel="Dismiss"
          />
          <View style={styles.shareModalCard}>
            <AppText style={styles.shareModalTitle}>
              {shareTarget === "matrix" ? "Share results matrix" : "Share leaderboard"}
            </AppText>
            <AppText style={styles.shareModalBody}>
              {shareTarget === "matrix"
                ? "Image (PNG) shows the latest event only. PDF includes every OOM event in the matrix."
                : "Image (PNG) works well for WhatsApp and social. PDF is best for printing and email."}
            </AppText>
            <View style={styles.shareModalActions}>
              <PrimaryButton onPress={runSharePng} disabled={exporting} size="md">
                Image (PNG)
              </PrimaryButton>
              <PrimaryButton onPress={runSharePdf} disabled={exporting} size="md">
                PDF
              </PrimaryButton>
              <SecondaryButton onPress={closeShareSheet} disabled={exporting} size="md">
                Cancel
              </SecondaryButton>
            </View>
          </View>
        </View>
      </Modal>

      <LicenceRequiredModal visible={modalVisible} onClose={() => setModalVisible(false)} societyId={guardSocietyId} />
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

function makeLeaderboardStyles(
  typography: TypographyTokens,
  colors: ReturnType<typeof getColors>,
) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
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
  headerTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: premiumTokens.cardShadow.shadowColor,
    shadowOffset: premiumTokens.cardShadow.shadowOffset,
    shadowOpacity: premiumTokens.cardShadow.shadowOpacity * 0.85,
    shadowRadius: premiumTokens.cardShadow.shadowRadius,
    elevation: premiumTokens.cardShadow.elevation,
  },

  // Title
  titleSection: {
    marginBottom: spacing.lg,
  },
  mainTitle: {
    fontSize: typography.title.fontSize,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.5,
  },
  seasonText: {
    fontSize: typography.small.fontSize,
    lineHeight: typography.small.lineHeight,
    color: colors.textSecondary,
    marginTop: 4,
  },
  tabHint: {
    fontSize: typography.small.fontSize,
    lineHeight: typography.small.lineHeight,
    color: colors.textTertiary,
    marginTop: 6,
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
    backgroundColor: colors.surfaceElevated,
    shadowColor: premiumTokens.cardShadow.shadowColor,
    shadowOffset: premiumTokens.cardShadow.shadowOffset,
    shadowOpacity: premiumTokens.cardShadow.shadowOpacity * 0.85,
    shadowRadius: premiumTokens.cardShadow.shadowRadius,
    elevation: premiumTokens.cardShadow.elevation,
  },
  tabText: {
    fontSize: typography.button.fontSize,
    fontWeight: "600",
    color: colors.textTertiary,
  },
  tabTextActive: {
    color: colors.primary,
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
    backgroundColor: colors.highlightMuted,
  },
  podiumMedalText: {
    fontSize: typography.h1.fontSize,
  },
  podiumName: {
    fontSize: typography.small.fontSize,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 6,
    textAlign: "center",
    lineHeight: typography.small.lineHeight,
    minHeight: 32,
    paddingHorizontal: 4,
  },
  podiumPoints: {
    fontSize: typography.h1.fontSize,
    fontWeight: "800",
    color: colors.primary,
    fontVariant: ["tabular-nums"],
  },
  podiumPointsGold: {
    fontSize: typography.display.fontSize,
    color: colors.highlight,
  },
  podiumPtsLabel: {
    fontSize: typography.small.fontSize,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  podiumBase: {
    width: "90%",
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  podiumBaseFirst: {
    height: 48,
    backgroundColor: colors.highlight,
  },
  podiumBaseSecond: {
    height: 32,
    backgroundColor: colors.divider,
  },
  podiumBaseThird: {
    height: 20,
    backgroundColor: colors.textTertiary,
  },

  // Field
  fieldCard: {
    padding: 16,
    marginBottom: 16,
  },
  fieldTitle: {
    fontSize: typography.captionBold.fontSize,
    fontWeight: "700",
    color: colors.textTertiary,
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
    fontSize: typography.button.fontSize,
    fontWeight: "600",
    color: colors.textSecondary,
    textAlign: "center",
  },
  trendContainer: {
    width: 20,
    alignItems: "center",
    marginRight: 8,
  },
  fieldName: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: "500",
    color: colors.text,
    lineHeight: typography.body.lineHeight,
    paddingRight: 8,
  },
  fieldEvents: {
    width: 32,
    fontSize: typography.body.fontSize,
    color: colors.textTertiary,
    textAlign: "center",
  },
  fieldPoints: {
    width: 50,
    fontSize: typography.bodyBold.fontSize,
    fontWeight: "700",
    color: colors.primary,
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
    backgroundColor: colors.primary + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  accordionEventNumber: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.primary,
  },
  accordionEventDetails: {
    flex: 1,
  },
  accordionEventName: {
    fontSize: typography.body.fontSize,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
    lineHeight: typography.body.lineHeight,
  },
  accordionEventMeta: {
    fontSize: typography.small.fontSize,
    color: colors.textTertiary,
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
    fontSize: typography.small.fontSize,
    fontWeight: "700",
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  accordionColPos: {
    width: 40,
    textAlign: "center",
  },
  accordionColPlayer: {
    flex: 1,
    paddingRight: 8,
  },
  accordionColScore: {
    width: 52,
    textAlign: "center",
  },
  accordionColOom: {
    width: 52,
    textAlign: "right",
  },
  accordionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.04)",
    minHeight: 48,
  },
  accordionRowAlt: {
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },
  accordionPosition: {
    width: 40,
    alignItems: "center",
  },
  accordionPositionText: {
    fontSize: typography.button.fontSize,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  accordionPositionMedal: {
    fontSize: typography.body.fontSize,
  },
  accordionPlayerName: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: "500",
    color: colors.textSecondary,
    paddingRight: 8,
    lineHeight: typography.body.lineHeight,
  },
  accordionScore: {
    width: 52,
    fontSize: typography.body.fontSize,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  accordionPoints: {
    width: 52,
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.primary,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },

  // Footer
  footer: {
    alignItems: "center",
    marginTop: 24,
    paddingTop: 16,
  },
  footerText: {
    fontSize: typography.small.fontSize,
    color: colors.textTertiary,
  },

  shareModalRoot: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.md,
    backgroundColor: "rgba(17, 24, 39, 0.5)",
  },
  shareModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  shareModalCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    padding: spacing.lg,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
    zIndex: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  shareModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  shareModalBody: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  shareModalActions: {
    gap: spacing.sm,
  },

  });
}
