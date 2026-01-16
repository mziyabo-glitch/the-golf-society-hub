/**
 * TEST PLAN:
 * - Navigate to leaderboard from dashboard
 * - Verify all members are listed with wins and events played
 * - Verify sorting: highest wins first
 * - Create multiple events, mark some as completed with winners
 * - Verify win counts update correctly
 * - Verify events played counts only completed events where player participated
 * - Close/reopen app, verify leaderboard persists correctly
 */

import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, Platform, Alert } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Row } from "@/components/ui/Row";
import { SocietyHeader } from "@/components/ui/SocietyHeader";
import { getColors, spacing } from "@/lib/ui/theme";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeMembersBySociety, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";
import { subscribeSocietyDoc, type SocietyDoc } from "@/lib/db/societyRepo";

type EventData = EventDoc;
type MemberData = MemberDoc;

type LeaderboardEntry = {
  member: MemberData;
  totalWins: number;
  eventsPlayed: number;
  totalPoints: number;
};

export default function LeaderboardScreen() {
  const { user } = useBootstrap();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [seasonYear, setSeasonYear] = useState<number>(new Date().getFullYear());
  const [showOOMOnly, setShowOOMOnly] = useState(false);
  const [society, setSociety] = useState<SocietyDoc | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingSociety, setLoadingSociety] = useState(true);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setMembers([]);
      setEvents([]);
      setSociety(null);
      setLoadingMembers(false);
      setLoadingEvents(false);
      setLoadingSociety(false);
      return;
    }

    setLoadingMembers(true);
    setLoadingEvents(true);
    setLoadingSociety(true);

    const unsubscribeMembers = subscribeMembersBySociety(user.activeSocietyId, (items) => {
      setMembers(items);
      setLoadingMembers(false);
    });

    const unsubscribeEvents = subscribeEventsBySociety(user.activeSocietyId, (items) => {
      setEvents(items);
      setLoadingEvents(false);
    });

    const unsubscribeSociety = subscribeSocietyDoc(user.activeSocietyId, (doc) => {
      setSociety(doc);
      setLoadingSociety(false);
    });

    return () => {
      unsubscribeMembers();
      unsubscribeEvents();
      unsubscribeSociety();
    };
  }, [user?.activeSocietyId]);

  const getEventYear = (eventDate: string): number | null => {
    if (!eventDate || eventDate.trim() === "") return null;
    
    try {
      // Try parsing as YYYY-MM-DD or ISO format
      const date = new Date(eventDate);
      if (isNaN(date.getTime())) {
        // Try extracting year from YYYY-MM-DD format directly
        const yearMatch = eventDate.match(/^(\d{4})/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1], 10);
          if (!isNaN(year) && year > 1900 && year < 2100) {
            return year;
          }
        }
        if (__DEV__) {
          console.warn(`[Leaderboard] Failed to parse event date: ${eventDate}`);
        }
        return null;
      }
      return date.getFullYear();
    } catch (error) {
      if (__DEV__) {
        console.warn(`[Leaderboard] Error parsing event date: ${eventDate}`, error);
      }
      return null;
    }
  };

  // F1-style points: 1st=25, 2nd=18, 3rd=15, 4th=12, 5th=10, 6th=8, 7th=6, 8th=4, 9th=2, 10th=1, 11+=0
  const getPointsForPosition = (position: number): number => {
    const pointsMap: { [key: number]: number } = {
      1: 25,
      2: 18,
      3: 15,
      4: 12,
      5: 10,
      6: 8,
      7: 6,
      8: 4,
      9: 2,
      10: 1,
    };
    return pointsMap[position] || 0;
  };

  // Calculate event leaderboard using same logic as event page
  // Uses event.results with grossScore (lowest wins)
  const getEventLeaderboard = (event: EventData): Array<{ memberId: string; grossScore: number }> => {
    if (!event.results || Object.keys(event.results).length === 0) {
      return [];
    }

    // Convert results to array and sort by grossScore (ascending - lowest wins)
    const leaderboard = Object.entries(event.results)
      .map(([memberId, result]) => ({
        memberId,
        grossScore: result.grossScore,
      }))
      .sort((a, b) => a.grossScore - b.grossScore);

    return leaderboard;
  };

  const calculateLeaderboard = (): LeaderboardEntry[] => {
    // Filter published events only (OOM only counts published results)
    let publishedEvents = events.filter((e) => {
      // Event must be published to count in OOM
      return e.resultsStatus === "published";
    });

    // Filter by season year
    const eventsInSeason = publishedEvents.filter((e) => {
      const eventYear = getEventYear(e.date);
      if (eventYear === null) {
        if (__DEV__) {
          console.log(`[Leaderboard] Excluding event "${e.name}" - invalid date: ${e.date}`);
        }
        return false;
      }
      return eventYear === seasonYear;
    });

    // Filter by OOM if requested
    const filteredEvents = showOOMOnly
      ? eventsInSeason.filter((e) => e.isOOM === true)
      : eventsInSeason;

    if (__DEV__) {
      console.log(
        `[Leaderboard] Season ${seasonYear}, ${showOOMOnly ? "Order of Merit only" : "All events"}: ${filteredEvents.length} events`
      );
      filteredEvents.forEach((e) => {
        const hasResults = e.results && Object.keys(e.results).length > 0;
        console.log(
          `[Leaderboard] Event "${e.name}": isOOM=${e.isOOM}, hasResults=${hasResults}, resultsCount=${hasResults ? Object.keys(e.results!).length : 0}`
        );
      });
    }

    // Initialize member stats
    const memberStats: { [memberId: string]: { wins: number; played: number; points: number } } = {};

    // Process each event
    filteredEvents.forEach((event) => {
      const eventLeaderboard = getEventLeaderboard(event);
      
      if (eventLeaderboard.length === 0) {
        return; // Skip events with no results
      }

      // Award points based on position
      eventLeaderboard.forEach((entry, index) => {
        const position = index + 1;
        const points = getPointsForPosition(position);
        const memberId = entry.memberId;

        // Initialize if not exists
        if (!memberStats[memberId]) {
          memberStats[memberId] = { wins: 0, played: 0, points: 0 };
        }

        // Add points
        memberStats[memberId].points += points;
        
        // Count as played
        memberStats[memberId].played += 1;

        // Count win if 1st place
        if (position === 1) {
          memberStats[memberId].wins += 1;
        }
      });
    });

    // Convert to LeaderboardEntry array
    const entries: LeaderboardEntry[] = members.map((member) => {
      const stats = memberStats[member.id] || { wins: 0, played: 0, points: 0 };
      return {
        member,
        totalWins: stats.wins,
        eventsPlayed: stats.played,
        totalPoints: stats.points,
      };
    });

    // Sort by Points desc, then Wins desc, then Played desc
    return entries.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      if (b.totalWins !== a.totalWins) {
        return b.totalWins - a.totalWins;
      }
      return b.eventsPlayed - a.eventsPlayed;
    });
  };

  const loading = loadingMembers || loadingEvents || loadingSociety;

  useEffect(() => {
    if (!loading && members.length > 0) {
      const calculated = calculateLeaderboard();
      setLeaderboard(calculated);
    }
  }, [members, events, loading, seasonYear, showOOMOnly]);

  const handleShareOrderOfMerit = async () => {
    try {
      // Filter to only members with points > 0
      const filteredLeaderboard = leaderboard.filter((entry) => (entry.totalPoints ?? 0) > 0);
      
      if (filteredLeaderboard.length === 0) {
        Alert.alert("Nothing to share", "No members have points yet.");
        return;
      }

      const logoHtml = society?.logoUrl 
        ? `<img src="${society.logoUrl}" alt="Society Logo" style="max-width: 100px; max-height: 100px; margin-bottom: 15px;" />`
        : "";

      // Create HTML for PDF
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; font-size: 14px; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { margin: 10px 0; font-size: 24px; font-weight: bold; }
            .header p { margin: 5px 0; font-size: 14px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #000; padding: 10px; text-align: left; }
            th { background-color: #0B6E4F; color: white; font-weight: bold; }
            .position { text-align: center; font-weight: bold; width: 60px; }
            .points { text-align: center; font-weight: bold; }
            .wins, .played { text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            ${logoHtml}
            <h1>Order of Merit</h1>
            <p>${society?.name || "Golf Society"} — ${seasonYear}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th class="position">Pos</th>
                <th>Member</th>
                <th class="points">Points</th>
                <th class="wins">Wins</th>
                <th class="played">Played</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLeaderboard
                .map(
                  (entry, index) => `
                <tr>
                  <td class="position">${index + 1}</td>
                  <td>${entry.member.name || "Unknown"}${entry.member.handicap !== undefined ? ` (HCP: ${entry.member.handicap})` : ""}</td>
                  <td class="points">${entry.totalPoints}</td>
                  <td class="wins">${entry.totalWins}</td>
                  <td class="played">${entry.eventsPlayed}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </body>
        </html>
      `;

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
              Alert.alert("Info", "PDF export not supported on this web build");
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
      Alert.alert("Share failed", "Please try again.");
    }
  };

  const colors = getColors();
  const hasPoints = leaderboard.filter((e) => e.totalPoints > 0).length > 0;

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
          showOOMOnly && hasPoints
            ? {
                label: "Share",
                onPress: handleShareOrderOfMerit,
              }
            : undefined
        }
      />
      <AppText variant="caption" color="secondary" style={styles.subtitle}>
        {showOOMOnly ? "Order of Merit Events" : "All Events"} — {seasonYear}
      </AppText>

      {/* Summary Card */}
      {hasPoints && (
        <AppCard style={styles.summaryCard}>
          <AppText variant="h2" style={styles.summaryTitle}>
            {showOOMOnly ? "Order of Merit" : "Season Leaderboard"}
          </AppText>
          <AppText variant="body" color="secondary" style={styles.summaryDescription}>
            {showOOMOnly
              ? "Points awarded for Order of Merit events only. F1-style scoring: 1st=25pts, 2nd=18pts, 3rd=15pts, etc."
              : "Points awarded for all published events. F1-style scoring: 1st=25pts, 2nd=18pts, 3rd=15pts, etc."}
          </AppText>
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
              Order of Merit Only
            </AppText>
          </Pressable>
        </Row>
      </AppCard>

      {/* Leaderboard */}
      {leaderboard.length === 0 || !hasPoints ? (
        <EmptyState
          title="No published events yet"
          message={
            showOOMOnly
              ? `No Order of Merit events published for ${seasonYear}`
              : `No events published for ${seasonYear}`
          }
        />
      ) : (
        <>
          {leaderboard.map((entry, index) => (
            <AppCard key={entry.member.id} style={styles.leaderboardItem}>
              <Row gap="md" alignItems="center">
                <View
                  style={[
                    styles.positionBadge,
                    index === 0 && { backgroundColor: "#fbbf24" },
                    index === 1 && { backgroundColor: "#9ca3af" },
                    index === 2 && { backgroundColor: "#cd7f32" },
                  ]}
                >
                  <AppText
                    variant="h2"
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
                    {entry.member.name}
                  </AppText>
                  {entry.member.handicap !== undefined && (
                    <AppText variant="small" color="secondary" numberOfLines={1}>
                      HCP: {entry.member.handicap}
                    </AppText>
                  )}
                </View>
                <Row gap="md">
                  <View style={styles.stat}>
                    <AppText variant="h2" style={{ color: colors.primary }}>
                      {entry.totalPoints}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      Points
                    </AppText>
                  </View>
                  <View style={styles.stat}>
                    <AppText variant="h2" style={{ color: colors.primary }}>
                      {entry.totalWins}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      Wins
                    </AppText>
                  </View>
                  <View style={styles.stat}>
                    <AppText variant="h2" style={{ color: colors.primary }}>
                      {entry.eventsPlayed}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      Played
                    </AppText>
                  </View>
                </Row>
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
  leaderboardItem: {
    marginBottom: spacing.base,
  },
  positionBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
    marginRight: spacing.sm,
  },
  memberName: {
    flexShrink: 1,
  },
  stat: {
    alignItems: "center",
    minWidth: 60,
  },
  backButton: {
    marginTop: spacing.xl,
  },
});

