/**
 * Season Leaderboard / Order of Merit Screen
 * 
 * Shows rankings based on published event results.
 * Uses F1-style points: 1st=25, 2nd=18, 3rd=15, etc.
 * Only shows members with points > 0.
 * 
 * DEFENSIVE GUARDS:
 * - No society → empty state
 * - No events → empty state
 * - No results → empty leaderboard
 * - Never crashes with missing data
 */

import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState, useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, Platform, Alert } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Row } from "@/components/ui/Row";
import { SocietyHeader } from "@/components/ui/SocietyHeader";
import { getColors, spacing } from "@/lib/ui/theme";
import { computeOrderOfMerit, generateOOMHtml, OOM_POINTS_MAP, type OOMEntry } from "@/lib/oom";
import type { EventData, MemberData } from "@/lib/models";
// Firestore read helpers
import { getSociety, getMembers } from "@/lib/firestore/society";
import { listEvents } from "@/lib/firestore/events";
import { aggregateSeasonPoints, type AggregatedMemberPoints } from "@/lib/firestore/results";
import { getActiveSocietyId, isFirebaseConfigured } from "@/lib/firebase";
import { NoSocietyGuard } from "@/components/NoSocietyGuard";
import { FirebaseConfigGuard } from "@/components/FirebaseConfigGuard";

type SocietyData = {
  name: string;
  logoUrl?: string | null;
};

export default function LeaderboardScreen() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [leaderboard, setLeaderboard] = useState<OOMEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seasonYear, setSeasonYear] = useState<number>(new Date().getFullYear());
  const [showOOMOnly, setShowOOMOnly] = useState(false);
  const [society, setSociety] = useState<SocietyData | null>(null);
  const [societyId, setSocietyId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [useSubcollection, setUseSubcollection] = useState(true); // Use new subcollection structure

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Check society ID first
      const activeSocietyId = getActiveSocietyId();
      setSocietyId(activeSocietyId);
      
      if (!activeSocietyId) {
        if (__DEV__) {
          console.log("[Leaderboard] No active society ID");
        }
        setLoading(false);
        return;
      }

      // Load society
      const societyData = await getSociety();
      if (societyData) {
        setSociety({ name: societyData.name, logoUrl: societyData.logoUrl });
      } else {
        setSociety(null);
      }

      // Load members using Firestore helper
      const loadedMembers = await getMembers();
      const safeMembers = Array.isArray(loadedMembers) ? loadedMembers : [];
      setMembers(safeMembers);

      // Load events using Firestore helper
      const loadedEvents = await listEvents(activeSocietyId);
      const safeEvents = Array.isArray(loadedEvents) ? loadedEvents : [];
      setEvents(safeEvents);

      // Dev logging
      if (__DEV__) {
        const publishedEvents = safeEvents.filter(e => e?.resultsStatus === "published");
        const eventsWithResults = safeEvents.filter(e => e?.results && Object.keys(e.results).length > 0);
        console.log("[Leaderboard] Data loaded:", {
          societyId: activeSocietyId,
          season: seasonYear,
          totalEvents: safeEvents.length,
          publishedEvents: publishedEvents.length,
          eventsWithResults: eventsWithResults.length,
          totalMembers: safeMembers.length,
        });
      }
    } catch (err) {
      console.error("[Leaderboard] Error loading data:", err);
      setError(err instanceof Error ? err.message : "Failed to load leaderboard data");
      // Still set empty arrays to prevent crashes
      setMembers([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // Compute leaderboard - uses subcollection first, falls back to inline results
  const calculateLeaderboard = useCallback(async (): Promise<OOMEntry[]> => {
    // Defensive guards
    if (!Array.isArray(events) || !Array.isArray(members)) {
      if (__DEV__) {
        console.log("[Leaderboard] calculateLeaderboard: No data available");
      }
      return [];
    }
    
    try {
      // Filter events for OOM if needed
      let filteredEvents = events;
      if (showOOMOnly) {
        filteredEvents = events.filter((e) => e.isOOM === true);
      }
      
      // Try subcollection-based aggregation first
      if (useSubcollection && societyId) {
        const aggregated = await aggregateSeasonPoints(
          filteredEvents,
          members,
          seasonYear,
          societyId
        );
        
        if (aggregated.length > 0) {
          if (__DEV__) {
            console.log("[Leaderboard] Using subcollection results:", {
              societyId,
              season: seasonYear,
              entriesWithPoints: aggregated.length,
            });
          }
          
          // Convert to OOMEntry format
          return aggregated.map((entry) => ({
            memberId: entry.memberId,
            memberName: entry.memberName,
            handicap: entry.handicap,
            totalPoints: entry.totalPoints,
            wins: entry.wins,
            played: entry.played,
          }));
        }
      }
      
      // Fallback to inline results computation (for legacy data)
      const result = computeOrderOfMerit({
        events: filteredEvents,
        members,
        seasonYear,
        oomOnly: showOOMOnly,
      });
      
      if (__DEV__) {
        // Count results aggregated from inline data
        const publishedEvents = filteredEvents.filter(e => e?.resultsStatus === "published");
        const resultsCount = publishedEvents.reduce((acc, e) => {
          if (e?.results) {
            return acc + Object.keys(e.results).length;
          }
          return acc;
        }, 0);
        
        console.log("[Leaderboard] OOM computed (inline fallback):", {
          societyId,
          season: seasonYear,
          oomOnly: showOOMOnly,
          eventsConsidered: publishedEvents.length,
          resultsAggregated: resultsCount,
          entriesWithPoints: result.length,
        });
      }
      
      return result;
    } catch (err) {
      console.error("[Leaderboard] Error computing OOM:", err);
      return [];
    }
  }, [events, members, seasonYear, showOOMOnly, societyId, useSubcollection]);

  // Update leaderboard when data or filters change
  useFocusEffect(
    useCallback(() => {
      if (!loading && !error && societyId) {
        setCalculating(true);
        calculateLeaderboard()
          .then((result) => {
            setLeaderboard(result);
          })
          .catch((err) => {
            console.error("[Leaderboard] Error in calculateLeaderboard:", err);
            setLeaderboard([]);
          })
          .finally(() => {
            setCalculating(false);
          });
      }
    }, [loading, error, societyId, calculateLeaderboard])
  );
  
  // Recalculate when season year or OOM filter changes
  useEffect(() => {
    if (!loading && !error && societyId && events.length > 0) {
      setCalculating(true);
      calculateLeaderboard()
        .then((result) => {
          setLeaderboard(result);
        })
        .finally(() => {
          setCalculating(false);
        });
    }
  }, [seasonYear, showOOMOnly]);

  const handleShareOrderOfMerit = async () => {
    if (isExporting) return;
    
    try {
      setIsExporting(true);
      
      if (leaderboard.length === 0) {
        Alert.alert("Nothing to export", "No members have points yet.");
        return;
      }

      // Generate HTML using centralized function
      const html = generateOOMHtml({
        entries: leaderboard,
        societyName: society?.name ?? "Golf Society",
        seasonYear,
        logoUrl: society?.logoUrl,
        oomOnly: showOOMOnly,
      });

      // Web platform: open in new window for print
      if (Platform.OS === "web") {
        try {
          if (typeof window !== "undefined" && window.open) {
            const printWindow = window.open("", "_blank");
            if (printWindow) {
              printWindow.document.write(html);
              printWindow.document.close();
              printWindow.focus();
              setTimeout(() => {
                printWindow.print();
              }, 250);
            } else {
              // Fallback: create downloadable blob
              const blob = new Blob([html], { type: "text/html" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `oom-${seasonYear}.html`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              Alert.alert("Success", "Order of Merit downloaded as HTML. Open and print to save as PDF.");
            }
          } else {
            Alert.alert("Info", "PDF export not supported on this web build");
          }
        } catch (webError) {
          console.error("Error with web print:", webError);
          Alert.alert("Error", "Failed to generate PDF on web. Please try again.");
        }
        return;
      }

      // Mobile: use expo-print + expo-sharing
      try {
        const { uri } = await Print.printToFileAsync({ html });
        const sharingAvailable = await Sharing.isAvailableAsync();
        if (sharingAvailable) {
          await Sharing.shareAsync(uri);
        } else {
          Alert.alert("Success", `PDF saved to: ${uri}`);
        }
      } catch (printError) {
        console.error("Error with print/sharing:", printError);
        Alert.alert("Error", "Failed to generate or share PDF. Please try again.");
      }
    } catch (error) {
      console.error("Error sharing Order of Merit:", error);
      Alert.alert("Export failed", "Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const colors = getColors();
  const hasPoints = leaderboard.length > 0;
  const hasEvents = events.length > 0;
  const hasPublishedEvents = events.some(e => e?.resultsStatus === "published");

  // Loading state
  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText style={{ marginTop: 12 }}>Loading leaderboard...</AppText>
        </View>
      </Screen>
    );
  }
  
  // Calculating state (show spinner but keep content visible)
  const showCalculating = calculating && !loading;

  // No society selected
  if (!societyId) {
    return <NoSocietyGuard message="Please select or create a society to view the Season Leaderboard." />;
  }

  // Error state
  if (error) {
    return (
      <FirebaseConfigGuard>
        <Screen scrollable={false}>
          <View style={styles.centerContent}>
            <AppText style={{ fontSize: 18, fontWeight: "600", marginBottom: 12, color: colors.error }}>
              Error Loading Leaderboard
            </AppText>
            <AppText style={{ color: "#6b7280", textAlign: "center", marginBottom: 20 }}>
              {error}
            </AppText>
            <SecondaryButton onPress={loadData}>
              Retry
            </SecondaryButton>
            <SecondaryButton onPress={() => router.back()} style={{ marginTop: spacing.sm }}>
              Back
            </SecondaryButton>
          </View>
        </Screen>
      </FirebaseConfigGuard>
    );
  }

  return (
    <FirebaseConfigGuard>
    <Screen>
      {society && (
        <SocietyHeader
          societyName={society.name}
          logoUrl={society.logoUrl}
          subtitle={showOOMOnly ? "Order of Merit" : "Season Leaderboard"}
        />
      )}
      <SectionHeader
        title={showOOMOnly ? "Order of Merit" : "Season Leaderboard"}
        rightAction={
          hasPoints
            ? {
                label: isExporting ? "Exporting..." : "Export PDF",
                onPress: handleShareOrderOfMerit,
              }
            : undefined
        }
      />
      <AppText variant="caption" color="secondary" style={styles.subtitle}>
        {showOOMOnly ? "Order of Merit Events" : "All Events"} — {seasonYear}
      </AppText>

      {/* Points Legend */}
      {hasPoints && (
        <AppCard style={styles.summaryCard}>
          <AppText variant="h2" style={styles.summaryTitle}>
            {showOOMOnly ? "Order of Merit" : "Season Leaderboard"}
          </AppText>
          <AppText variant="body" color="secondary" style={styles.summaryDescription}>
            {showOOMOnly
              ? "Points awarded for Order of Merit events only."
              : "Points awarded for all published events."}
          </AppText>
          <View style={styles.pointsLegend}>
            <AppText variant="caption" color="secondary">
              Points: 1st={OOM_POINTS_MAP[1]}, 2nd={OOM_POINTS_MAP[2]}, 3rd={OOM_POINTS_MAP[3]}, 
              4th={OOM_POINTS_MAP[4]}, 5th={OOM_POINTS_MAP[5]}, 6th-10th=8-1
            </AppText>
          </View>
        </AppCard>
      )}

      {/* Filters */}
      <AppCard style={styles.filterCard}>
        <AppText variant="bodyBold" style={styles.filterLabel}>
          Season Year
        </AppText>
        <TextInput
          value={seasonYear.toString()}
          onChangeText={(text) => {
            const year = parseInt(text, 10);
            if (!isNaN(year) && year > 1900 && year < 2100) {
              setSeasonYear(year);
            }
          }}
          keyboardType="numeric"
          style={[styles.yearInput, { borderColor: colors.border, color: colors.text }]}
          placeholder="YYYY"
        />
      </AppCard>

      <AppCard style={styles.filterCard}>
        <AppText variant="bodyBold" style={styles.filterLabel}>
          Event Filter
        </AppText>
        <Row gap="sm" style={styles.toggleContainer}>
          <Pressable
            onPress={() => setShowOOMOnly(false)}
            style={[
              styles.toggleButton,
              !showOOMOnly && { backgroundColor: colors.primary },
            ]}
          >
            <AppText
              variant="button"
              style={!showOOMOnly ? { color: colors.textInverse } : undefined}
            >
              All Events
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => setShowOOMOnly(true)}
            style={[
              styles.toggleButton,
              showOOMOnly && { backgroundColor: colors.primary },
            ]}
          >
            <AppText
              variant="button"
              style={showOOMOnly ? { color: colors.textInverse } : undefined}
            >
              OOM Only
            </AppText>
          </Pressable>
        </Row>
      </AppCard>

      {/* Leaderboard Table - Always visible in-app */}
      {!hasEvents ? (
        <EmptyState
          title="No Events Yet"
          message={`No events have been created for ${seasonYear}. Create an event to get started.`}
        />
      ) : !hasPublishedEvents ? (
        <EmptyState
          title="No Published Results"
          message={`No event results have been published for ${seasonYear}. Complete an event and publish the results to see the Season Leaderboard.`}
        />
      ) : !hasPoints ? (
        <EmptyState
          title="No Points Awarded Yet"
          message={
            showOOMOnly
              ? `No Order of Merit events have awarded points for ${seasonYear}. Publish event results with final positions to see the leaderboard.`
              : `No events have awarded points for ${seasonYear}. Publish event results with final positions to see the leaderboard.`
          }
        />
      ) : (
        <>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.tableHeaderPos}>
              <AppText variant="captionBold" color="secondary">Pos</AppText>
            </View>
            <View style={styles.tableHeaderName}>
              <AppText variant="captionBold" color="secondary">Member</AppText>
            </View>
            <View style={styles.tableHeaderStat}>
              <AppText variant="captionBold" color="secondary">Pts</AppText>
            </View>
            <View style={styles.tableHeaderStat}>
              <AppText variant="captionBold" color="secondary">Wins</AppText>
            </View>
            <View style={styles.tableHeaderStat}>
              <AppText variant="captionBold" color="secondary">Played</AppText>
            </View>
          </View>

          {/* Table Rows - Safe render with fallback */}
          {(Array.isArray(leaderboard) ? leaderboard : []).map((entry, index) => (
            <AppCard key={entry.memberId} style={styles.leaderboardItem}>
              <Row gap="sm" alignItems="center">
                <View
                  style={[
                    styles.positionBadge,
                    index === 0 && { backgroundColor: "#fbbf24" },
                    index === 1 && { backgroundColor: "#9ca3af" },
                    index === 2 && { backgroundColor: "#cd7f32" },
                  ]}
                >
                  <AppText
                    variant="bodyBold"
                    style={StyleSheet.flatten([
                      styles.positionText,
                      index < 3 && { color: "#fff" },
                    ])}
                  >
                    {index + 1}
                  </AppText>
                </View>
                <View style={styles.entryContent}>
                  <AppText variant="bodyBold" numberOfLines={1} ellipsizeMode="tail" style={styles.memberName}>
                    {entry.memberName}
                  </AppText>
                  {entry.handicap !== undefined && (
                    <AppText variant="small" color="secondary" numberOfLines={1}>
                      HCP: {entry.handicap}
                    </AppText>
                  )}
                </View>
                <View style={styles.stat}>
                  <AppText variant="h2" style={{ color: colors.primary }}>
                    {entry.totalPoints}
                  </AppText>
                </View>
                <View style={styles.stat}>
                  <AppText variant="body" style={{ color: colors.text }}>
                    {entry.wins}
                  </AppText>
                </View>
                <View style={styles.stat}>
                  <AppText variant="body" color="secondary">
                    {entry.played}
                  </AppText>
                </View>
              </Row>
            </AppCard>
          ))}
        </>
      )}

      <SecondaryButton onPress={() => router.back()} style={styles.backButton}>
        Back to Dashboard
      </SecondaryButton>
    </Screen>
    </FirebaseConfigGuard>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  subtitle: {
    marginBottom: spacing.lg,
  },
  summaryCard: {
    marginBottom: spacing.base,
  },
  summaryTitle: {
    marginBottom: spacing.xs,
  },
  summaryDescription: {
    marginTop: spacing.xs,
  },
  pointsLegend: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  filterCard: {
    marginBottom: spacing.base,
  },
  filterLabel: {
    marginBottom: spacing.sm,
  },
  yearInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    fontSize: 16,
    minHeight: 44,
  },
  toggleContainer: {
    marginTop: spacing.sm,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    backgroundColor: "#f3f4f6",
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: spacing.sm,
    alignItems: "center",
  },
  tableHeaderPos: {
    width: 40,
    alignItems: "center",
  },
  tableHeaderName: {
    flex: 1,
    paddingLeft: spacing.sm,
  },
  tableHeaderStat: {
    width: 50,
    alignItems: "center",
  },
  leaderboardItem: {
    marginBottom: spacing.sm,
  },
  positionBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  positionText: {
    fontWeight: "700",
  },
  entryContent: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.xs,
  },
  memberName: {
    flexShrink: 1,
  },
  stat: {
    alignItems: "center",
    minWidth: 50,
  },
  backButton: {
    marginTop: spacing.xl,
  },
});

