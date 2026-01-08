/**
 * Order of Merit / Season Leaderboard Screen
 * 
 * Shows rankings based on published event results.
 * Uses F1-style points: 1st=25, 2nd=18, 3rd=15, etc.
 * Only shows members with points > 0.
 */

import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
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
// Firestore read helpers (with AsyncStorage fallback)
import { getSociety, getMembers, getEvents } from "@/lib/firestore/society";

type SocietyData = {
  name: string;
  logoUrl?: string | null;
};

export default function LeaderboardScreen() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [leaderboard, setLeaderboard] = useState<OOMEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [seasonYear, setSeasonYear] = useState<number>(new Date().getFullYear());
  const [showOOMOnly, setShowOOMOnly] = useState(false);
  const [society, setSociety] = useState<SocietyData | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      // Load society using Firestore helper (with AsyncStorage fallback)
      const societyData = await getSociety();
      if (societyData) {
        setSociety({ name: societyData.name, logoUrl: societyData.logoUrl });
      }

      // Load members using Firestore helper (with AsyncStorage fallback)
      const loadedMembers = await getMembers();
      setMembers(Array.isArray(loadedMembers) ? loadedMembers : []);

      // Load events using Firestore helper (with AsyncStorage fallback)
      const loadedEvents = await getEvents();
      setEvents(Array.isArray(loadedEvents) ? loadedEvents : []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Compute leaderboard using centralized OOM function
  const calculateLeaderboard = useCallback((): OOMEntry[] => {
    return computeOrderOfMerit({
      events,
      members,
      seasonYear,
      oomOnly: showOOMOnly,
    });
  }, [events, members, seasonYear, showOOMOnly]);

  // Update leaderboard when data changes
  useFocusEffect(
    useCallback(() => {
      if (!loading) {
        const calculated = calculateLeaderboard();
        setLeaderboard(calculated);
      }
    }, [loading, calculateLeaderboard])
  );

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

  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
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
      {!hasPoints ? (
        <EmptyState
          title="No results yet"
          message={
            showOOMOnly
              ? `No Order of Merit events published for ${seasonYear}. Publish event results to see the leaderboard.`
              : `No events published for ${seasonYear}. Publish event results to see the leaderboard.`
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

          {/* Table Rows */}
          {leaderboard.map((entry, index) => (
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

