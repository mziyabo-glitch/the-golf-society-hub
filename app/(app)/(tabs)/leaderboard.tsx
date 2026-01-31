import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { StyleSheet, View, Platform, Alert, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";

// Only import captureRef on native platforms
const captureRef =
  Platform.OS !== "web" ? require("react-native-view-shot").captureRef : null;

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { SocietyBadge } from "@/components/ui/SocietyHeader";
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

/**
 * Format OOM points for display
 * - Shows decimals only when needed (e.g., 16.5, not 25.00)
 * - Hides .00 for whole numbers (e.g., 25, not 25.00)
 */
function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) {
    return pts.toString();
  }
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
  const [sharingLeaderboard, setSharingLeaderboard] = useState(false);
  const [sharingLog, setSharingLog] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Refs for capturing share cards as images (completely isolated from main UI)
  const leaderboardShareRef = useRef<View>(null);
  const resultsLogShareRef = useRef<View>(null);

  const loadData = useCallback(async () => {
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

  // Group results log by event for display
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
    if (params.view === "log") {
      setActiveTab("resultsLog");
    }
  }, [params.view]);

  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadData();
      }
    }, [societyId, loadData])
  );

  // Count OOM events with results
  const uniqueOOMEventIds = new Set(resultsLog.map((r) => r.eventId));
  const oomEventCount = uniqueOOMEventIds.size;

  // Prepare data for leaderboard share card
  const shareCardRows: OOMShareRow[] = useMemo(() => {
    return standings.map((entry) => ({
      position: entry.rank,
      name: entry.memberName,
      points: entry.totalPoints,
      eventsPlayed: entry.eventsPlayed,
    }));
  }, [standings]);

  // Season label for the share card
  const seasonLabel = useMemo(() => {
    const year = new Date().getFullYear();
    return `${year} Season • ${oomEventCount} event${oomEventCount !== 1 ? "s" : ""}`;
  }, [oomEventCount]);

  // Prepare data for results log share card (latest event only)
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

  // Share Leaderboard handler
  const handleShareLeaderboard = async () => {
    console.log("[Leaderboard] Share Leaderboard pressed, platform:", Platform.OS);

    if (standings.length === 0) {
      Alert.alert("No Data", "No standings to share.");
      return;
    }

    try {
      setSharingLeaderboard(true);

      // On web, use PDF generation
      if (Platform.OS === "web") {
        const html = generateLeaderboardHTML();
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: "Share Order of Merit",
            UTI: "com.adobe.pdf",
          });
        } else {
          await Print.printAsync({ html });
        }
        return;
      }

      // On native, capture the off-screen share card
      if (!leaderboardShareRef.current || !captureRef) {
        Alert.alert("Error", "Share card not ready. Please try again.");
        return;
      }

      const uri = await captureRef(leaderboardShareRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      console.log("[Leaderboard] Image captured:", uri);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share Order of Merit",
          UTI: "public.png",
        });
      } else {
        Alert.alert("Sharing Unavailable", "Sharing is not available on this device.");
      }
    } catch (err: any) {
      console.error("[Leaderboard] Share error:", err);
      Alert.alert("Error", err?.message || "Failed to share leaderboard");
    } finally {
      setSharingLeaderboard(false);
    }
  };

  // Share Results Log handler
  const handleShareResultsLog = async () => {
    console.log("[Leaderboard] Share Results Log pressed, platform:", Platform.OS);

    if (!latestEventForShare) {
      Alert.alert("No Data", "No results to share.");
      return;
    }

    try {
      setSharingLog(true);

      // On web, use PDF generation
      if (Platform.OS === "web") {
        const html = generateResultsLogHTML();
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: "Share Results Log",
            UTI: "com.adobe.pdf",
          });
        } else {
          await Print.printAsync({ html });
        }
        return;
      }

      // On native, capture the off-screen share card
      if (!resultsLogShareRef.current || !captureRef) {
        Alert.alert("Error", "Share card not ready. Please try again.");
        return;
      }

      const uri = await captureRef(resultsLogShareRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      console.log("[Leaderboard] Results Log image captured:", uri);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share Results Log",
          UTI: "public.png",
        });
      } else {
        Alert.alert("Sharing Unavailable", "Sharing is not available on this device.");
      }
    } catch (err: any) {
      console.error("[Leaderboard] Share error:", err);
      Alert.alert("Error", err?.message || "Failed to share results log");
    } finally {
      setSharingLog(false);
    }
  };

  // Generate HTML for Leaderboard PDF (web)
  const generateLeaderboardHTML = () => {
    const societyName = society?.name || "Golf Society";
    const date = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const rows = standings
      .map(
        (entry) => `
      <tr style="background: ${entry.rank <= 3 ? "#FFFBEB" : entry.rank % 2 === 0 ? "#FAFAFA" : "#FFF"};">
        <td style="padding: 14px 12px; border-bottom: 1px solid #F3F4F6; text-align: center; font-weight: ${
          entry.rank <= 3 ? "600" : "500"
        }; color: ${entry.rank === 1 ? "#D4AF37" : entry.rank === 2 ? "#9CA3AF" : entry.rank === 3 ? "#CD7F32" : "#6B7280"};">
          ${entry.rank}
        </td>
        <td style="padding: 14px 12px; border-bottom: 1px solid #F3F4F6; font-weight: ${entry.rank <= 3 ? "600" : "500"};">${entry.memberName}</td>
        <td style="padding: 14px 12px; border-bottom: 1px solid #F3F4F6; text-align: center; color: #6B7280;">${entry.eventsPlayed}</td>
        <td style="padding: 14px 12px; border-bottom: 1px solid #F3F4F6; text-align: right; font-weight: 600; color: #0B6E4F;">${formatPoints(entry.totalPoints)}</td>
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
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #111827; background: #fff; }
            .container { max-width: 500px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 24px; }
            .society { font-size: 14px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
            h1 { color: #0B6E4F; margin: 0 0 4px 0; font-size: 28px; }
            .subtitle { color: #374151; font-size: 16px; margin-bottom: 4px; }
            .date { color: #9CA3AF; font-size: 13px; }
            .divider { height: 3px; background: #0B6E4F; margin: 20px 0; border-radius: 2px; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; }
            th { background: #0B6E4F; color: white; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
            th:first-child { text-align: center; }
            th:nth-child(3) { text-align: center; }
            th:last-child { text-align: right; }
            .footer { margin-top: 24px; text-align: center; padding-top: 16px; border-top: 2px solid #E5E7EB; }
            .footer-text { color: #9CA3AF; font-size: 11px; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <p class="society">${societyName}</p>
              <h1>Order of Merit</h1>
              <p class="subtitle">Season Leaderboard</p>
              <p class="date">${seasonLabel}</p>
            </div>
            <div class="divider"></div>
            ${standings.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th style="text-align: center;">Pos</th>
                  <th>Player</th>
                  <th style="text-align: center;">Events</th>
                  <th style="text-align: right;">Points</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            ` : `<p style="text-align: center; color: #6B7280;">No standings yet.</p>`}
            <div class="footer">
              <p class="footer-text">Produced by The Golf Society Hub</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Generate HTML for Results Log PDF (web)
  const generateResultsLogHTML = () => {
    const societyName = society?.name || "Golf Society";
    if (!latestEventForShare) return "";

    const isStrokeplay =
      latestEventForShare.format?.includes("strokeplay") ||
      latestEventForShare.format === "medal";

    const rows = latestEventForShare.results
      .map(
        (r, idx) => `
      <tr style="background: ${r.position && r.position <= 3 ? "#FFFBEB" : idx % 2 === 1 ? "#FAFAFA" : "#FFF"};">
        <td style="padding: 12px; border-bottom: 1px solid #F3F4F6; font-weight: ${r.position && r.position <= 3 ? "600" : "500"};">${r.memberName}</td>
        <td style="padding: 12px; border-bottom: 1px solid #F3F4F6; text-align: center; color: #6B7280;">${r.dayValue ?? "-"}</td>
        <td style="padding: 12px; border-bottom: 1px solid #F3F4F6; text-align: center; color: ${r.position && r.position <= 3 ? "#D97706" : "#6B7280"}; font-weight: ${r.position && r.position <= 3 ? "600" : "500"};">${r.position ?? "-"}</td>
        <td style="padding: 12px; border-bottom: 1px solid #F3F4F6; text-align: right; font-weight: 600; color: #0B6E4F;">${formatPoints(r.points)}</td>
      </tr>
    `
      )
      .join("");

    const formatLabel = latestEventForShare.format
      ? latestEventForShare.format.charAt(0).toUpperCase() +
        latestEventForShare.format.slice(1)
      : "";
    const dateStr = latestEventForShare.eventDate
      ? new Date(latestEventForShare.eventDate).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Results Log - ${societyName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #111827; background: #fff; }
            .container { max-width: 500px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 24px; }
            .society { font-size: 14px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
            h1 { color: #0B6E4F; margin: 0 0 4px 0; font-size: 28px; }
            .subtitle { color: #374151; font-size: 16px; }
            .divider { height: 3px; background: #0B6E4F; margin: 20px 0; border-radius: 2px; }
            .event-card { border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; }
            .event-header { background: #F9FAFB; padding: 14px; border-bottom: 1px solid #E5E7EB; }
            .event-name { font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 4px; }
            .event-meta { font-size: 13px; color: #6B7280; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #0B6E4F; color: white; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
            th:nth-child(2), th:nth-child(3) { text-align: center; }
            th:last-child { text-align: right; }
            .footer { margin-top: 24px; text-align: center; padding-top: 16px; border-top: 2px solid #E5E7EB; }
            .footer-text { color: #9CA3AF; font-size: 11px; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <p class="society">${societyName}</p>
              <h1>Order of Merit</h1>
              <p class="subtitle">Latest Event Results</p>
            </div>
            <div class="divider"></div>
            <div class="event-card">
              <div class="event-header">
                <p class="event-name">${latestEventForShare.eventName}</p>
                <p class="event-meta">${dateStr}${formatLabel ? ` • ${formatLabel}` : ""}</p>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th style="text-align: center;">${isStrokeplay ? "Net" : "Pts"}</th>
                    <th style="text-align: center;">Pos</th>
                    <th style="text-align: right;">OOM</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="footer">
              <p class="footer-text">Produced by The Golf Society Hub</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Loading state
  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading Order of Merit..." />
        </View>
      </Screen>
    );
  }

  // Error state
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

  // No society state
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
  const formatLabelDisplay = (format: string | null) => {
    if (!format) return "";
    return format.charAt(0).toUpperCase() + format.slice(1);
  };

  const canShareLeaderboard = standings.length > 0;
  const canShareLog = groupedResultsLog.length > 0;

  // Get logo URL from society
  const logoUrl = (society as any)?.logo_url || (society as any)?.logoUrl || null;

  return (
    <>
      <Screen>
        {/* Society Badge */}
        <SocietyBadge
          societyName={society?.name || "Golf Society"}
          logoUrl={logoUrl}
          size="md"
          style={{ marginBottom: spacing.sm }}
        />

        {/* Header with Share Buttons */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText variant="title">Order of Merit</AppText>
            <AppText variant="caption" color="secondary">
              {activeTab === "leaderboard"
                ? `${oomEventCount} event${oomEventCount !== 1 ? "s" : ""} completed`
                : "Results by event"}
            </AppText>
          </View>

          {/* Share buttons */}
          <View style={styles.shareButtons}>
            {activeTab === "leaderboard" ? (
              <>
                {canShareLeaderboard && (
                  <SecondaryButton
                    onPress={handleShareLeaderboard}
                    size="sm"
                    disabled={sharingLeaderboard}
                  >
                    <Feather name="share" size={14} color={colors.text} />
                    {sharingLeaderboard ? " ..." : ""}
                  </SecondaryButton>
                )}
              </>
            ) : (
              <>
                {canShareLog && (
                  <SecondaryButton
                    onPress={handleShareResultsLog}
                    size="sm"
                    disabled={sharingLog}
                  >
                    <Feather name="share" size={14} color={colors.text} />
                    {sharingLog ? " ..." : ""}
                  </SecondaryButton>
                )}
              </>
            )}
          </View>
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
              Leaderboard
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
                title="No standings yet"
                message="Create an OOM event, add players, and enter scores to start the leaderboard."
              />
            ) : (
              <View style={styles.list}>
                {standings.map((entry) => {
                  const isTop3 = entry.rank <= 3;
                  const medalColorMap: Record<number, string> = {
                    1: colors.warning,
                    2: "#C0C0C0",
                    3: "#CD7F32",
                  };
                  const medalColor = medalColorMap[entry.rank];

                  return (
                    <AppCard key={entry.memberId} style={styles.standingCard}>
                      <View style={styles.standingRow}>
                        <View
                          style={[
                            styles.positionBadge,
                            {
                              backgroundColor:
                                isTop3 && medalColor
                                  ? medalColor + "20"
                                  : colors.backgroundTertiary,
                            },
                          ]}
                        >
                          {isTop3 && medalColor ? (
                            <Feather name="award" size={16} color={medalColor} />
                          ) : (
                            <AppText variant="captionBold" color="secondary">
                              {entry.rank}
                            </AppText>
                          )}
                        </View>

                        <View style={styles.memberInfo}>
                          <AppText variant="bodyBold">{entry.memberName}</AppText>
                          <AppText variant="caption" color="secondary">
                            {entry.eventsPlayed} event{entry.eventsPlayed !== 1 ? "s" : ""}
                          </AppText>
                        </View>

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

            <AppCard style={styles.infoCard}>
              <View style={styles.infoContent}>
                <Feather name="info" size={16} color={colors.textTertiary} />
                <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
                  F1-style points (25, 18, 15, 12, 10, 8, 6, 4, 2, 1) for positions 1-10. Ties
                  share averaged points. Only OOM events count.
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
                title="No results yet"
                message="Create an OOM event and enter scores to see the results log."
              />
            ) : (
              <View style={styles.list}>
                {groupedResultsLog.map((group) => (
                  <View key={group.eventId} style={styles.eventGroup}>
                    <View
                      style={[styles.eventHeader, { backgroundColor: colors.backgroundSecondary }]}
                    >
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
                              <AppText variant="small" color="tertiary">
                                {" "}
                                •{" "}
                              </AppText>
                              <AppText variant="small" color="tertiary">
                                {formatLabelDisplay(group.format)}
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

                    <View style={[styles.resultHeaderRow, { borderBottomColor: colors.border }]}>
                      <AppText variant="captionBold" color="tertiary" style={{ flex: 1 }}>
                        Player
                      </AppText>
                      <AppText variant="captionBold" color="tertiary" style={styles.auditCol}>
                        {group.format?.includes("strokeplay") || group.format === "medal"
                          ? "Net"
                          : "Pts"}
                      </AppText>
                      <AppText variant="captionBold" color="tertiary" style={styles.auditCol}>
                        Pos
                      </AppText>
                      <AppText variant="captionBold" color="tertiary" style={styles.auditCol}>
                        OOM
                      </AppText>
                    </View>

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
                          {result.dayValue ?? "-"}
                        </AppText>
                        <AppText variant="body" color="secondary" style={styles.auditCol}>
                          {result.position ?? "-"}
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

            <AppCard style={styles.infoCard}>
              <View style={styles.infoContent}>
                <Feather name="info" size={16} color={colors.textTertiary} />
                <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
                  Day Value shows the raw score entered. Position and OOM points are calculated
                  automatically.
                </AppText>
              </View>
            </AppCard>
          </>
        )}
      </Screen>

      {/* OFF-SCREEN SHARE CARDS - Rendered outside Screen component to avoid tab bar */}
      {/* These are positioned far off-screen and only used for image capture */}
      {Platform.OS !== "web" && (
        <View style={styles.offScreenWrapper} pointerEvents="none">
          {/* Leaderboard Share Card */}
          <View style={styles.offScreenCard} collapsable={false}>
            <OOMShareCard
              ref={leaderboardShareRef}
              societyName={society?.name || "Golf Society"}
              seasonLabel={seasonLabel}
              rows={shareCardRows}
            />
          </View>

          {/* Results Log Share Card */}
          {latestEventForShare && (
            <View style={styles.offScreenCard} collapsable={false}>
              <OOMResultsLogShareCard
                ref={resultsLogShareRef}
                societyName={society?.name || "Golf Society"}
                event={latestEventForShare}
                isLatestOnly={true}
              />
            </View>
          )}
        </View>
      )}
    </>
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
  shareButtons: {
    flexDirection: "row",
    gap: spacing.xs,
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
  infoCard: {
    marginTop: spacing.sm,
  },
  infoContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  // Off-screen wrapper - OUTSIDE the Screen component to avoid capturing tabs
  offScreenWrapper: {
    position: "absolute",
    top: -10000,
    left: -10000,
    opacity: 1,
  },
  offScreenCard: {
    marginBottom: 20,
  },
});
