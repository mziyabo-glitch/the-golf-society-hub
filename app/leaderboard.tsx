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

import { STORAGE_KEYS } from "@/lib/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const EVENTS_KEY = STORAGE_KEYS.EVENTS;
const MEMBERS_KEY = STORAGE_KEYS.MEMBERS;

type EventData = {
  id: string;
  name: string;
  date: string;
  courseName: string;
  format: "Stableford" | "Strokeplay" | "Both";
  playerIds?: string[];
  isCompleted?: boolean;
  resultsStatus?: "draft" | "published";
  publishedAt?: string;
  isOOM?: boolean;
  winnerId?: string;
  winnerName?: string;
  results?: {
    [memberId: string]: {
      grossScore: number;
      netScore?: number;
      stableford?: number;
      strokeplay?: number;
    };
  };
};

type MemberData = {
  id: string;
  name: string;
  handicap?: number;
};

type LeaderboardEntry = {
  member: MemberData;
  totalWins: number;
  eventsPlayed: number;
  totalPoints: number;
};

export default function LeaderboardScreen() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [seasonYear, setSeasonYear] = useState<number>(new Date().getFullYear());
  const [showOOMOnly, setShowOOMOnly] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      // Load members
      const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
      if (membersData) {
        setMembers(JSON.parse(membersData));
      }

      // Load events
      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      if (eventsData) {
        setEvents(JSON.parse(eventsData));
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

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
        `[Leaderboard] Season ${seasonYear}, ${showOOMOnly ? "OOM only" : "All events"}: ${filteredEvents.length} events`
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

  // Update leaderboard when data changes
  useFocusEffect(
    useCallback(() => {
      if (!loading && members.length > 0) {
        const calculated = calculateLeaderboard();
        setLeaderboard(calculated);
      }
    }, [members, events, loading, seasonYear, showOOMOnly])
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#0B6E4F" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Season Leaderboard</Text>
        <Text style={styles.subtitle}>Wins and events played this season</Text>

        {/* Year Selector */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Season Year</Text>
          <View style={styles.yearInputContainer}>
            <TextInput
              value={seasonYear.toString()}
              onChangeText={(text) => {
                const year = parseInt(text, 10);
                if (!isNaN(year) && year > 1900 && year < 2100) {
                  setSeasonYear(year);
                }
              }}
              keyboardType="numeric"
              style={styles.yearInput}
              placeholder="YYYY"
            />
          </View>
        </View>

        {/* OOM Filter Toggle */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Event Filter</Text>
          <View style={styles.toggleContainer}>
            <Pressable
              onPress={() => setShowOOMOnly(false)}
              style={[
                styles.toggleButton,
                !showOOMOnly && styles.toggleButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.toggleButtonText,
                  !showOOMOnly && styles.toggleButtonTextActive,
                ]}
              >
                All
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowOOMOnly(true)}
              style={[
                styles.toggleButton,
                showOOMOnly && styles.toggleButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.toggleButtonText,
                  showOOMOnly && styles.toggleButtonTextActive,
                ]}
              >
                OOM Only
              </Text>
            </Pressable>
          </View>
        </View>

        {leaderboard.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No completed events yet</Text>
            <Text style={styles.emptySubtext}>
              Complete events to see leaderboard rankings
            </Text>
          </View>
        ) : (
          <View style={styles.leaderboardList}>
            {leaderboard.map((entry, index) => (
              <View key={entry.member.id} style={styles.leaderboardItem}>
                <View style={styles.positionContainer}>
                  <View
                    style={[
                      styles.positionBadge,
                      index === 0 && styles.positionBadgeFirst,
                      index === 1 && styles.positionBadgeSecond,
                      index === 2 && styles.positionBadgeThird,
                    ]}
                  >
                    <Text
                      style={[
                        styles.positionText,
                        index < 3 && styles.positionTextWhite,
                      ]}
                    >
                      {index + 1}
                    </Text>
                  </View>
                </View>
                <View style={styles.entryContent}>
                  <Text style={styles.memberName}>{entry.member.name}</Text>
                  {entry.member.handicap !== undefined && (
                    <Text style={styles.memberHandicap}>HCP: {entry.member.handicap}</Text>
                  )}
                </View>
                <View style={styles.statsContainer}>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{entry.totalPoints}</Text>
                    <Text style={styles.statLabel}>Points</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{entry.totalWins}</Text>
                    <Text style={styles.statLabel}>Wins</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{entry.eventsPlayed}</Text>
                    <Text style={styles.statLabel}>Played</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.backButtonContainer}>
          <Text style={styles.backButtonText} onPress={() => router.back()}>
            Back to Dashboard
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.75,
    marginBottom: 28,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
    textAlign: "center",
  },
  leaderboardList: {
    marginBottom: 24,
  },
  leaderboardItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  positionContainer: {
    marginRight: 16,
  },
  positionBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  positionBadgeFirst: {
    backgroundColor: "#fbbf24",
  },
  positionBadgeSecond: {
    backgroundColor: "#9ca3af",
  },
  positionBadgeThird: {
    backgroundColor: "#cd7f32",
  },
  positionText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  positionTextWhite: {
    color: "#fff",
  },
  entryContent: {
    flex: 1,
  },
  memberName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  memberHandicap: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
  },
  statsContainer: {
    flexDirection: "row",
    gap: 12,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0B6E4F",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.7,
    color: "#111827",
  },
  backButtonContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0B6E4F",
  },
  filterSection: {
    marginBottom: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  yearInputContainer: {
    flexDirection: "row",
  },
  yearInput: {
    flex: 1,
    backgroundColor: "#f9fafb",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  toggleButtonActive: {
    backgroundColor: "#0B6E4F",
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  toggleButtonTextActive: {
    color: "#fff",
  },
});

