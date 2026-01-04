/**
 * TEST PLAN:
 * - Navigate to event details, tap "Enter Results" button
 * - Verify only selected players (from Players screen) are shown
 * - Enter gross scores for each player
 * - Verify validation: scores must be numbers > 0
 * - Save results and verify winner is auto-calculated (lowest gross)
 * - Mark event as completed
 * - Verify event moves from Next Event to Last Event on dashboard
 * - Verify winner name appears on Last Event card
 * - Close/reopen app, verify results persist
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getSession } from "@/lib/session";
import { canEditHandicaps } from "@/lib/roles";

const EVENTS_KEY = "GSOCIETY_EVENTS";
const MEMBERS_KEY = "GSOCIETY_MEMBERS";

type EventData = {
  id: string;
  name: string;
  date: string;
  courseName: string;
  format: "Stableford" | "Strokeplay" | "Both";
  playerIds?: string[];
  isCompleted?: boolean;
  isOOM?: boolean;
  winnerId?: string;
  winnerName?: string;
  results?: {
    [memberId: string]: {
      grossScore: number;
      netScore?: number;
    };
  };
};

type MemberData = {
  id: string;
  name: string;
  handicap?: number;
};

export default function EventResultsScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<MemberData[]>([]);
  const [results, setResults] = useState<{ [memberId: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"admin" | "member">("member");
  const [canEdit, setCanEdit] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [eventId])
  );

  const loadData = async () => {
    try {
      // Load event
      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      if (eventsData) {
        const allEvents: EventData[] = JSON.parse(eventsData);
        const currentEvent = allEvents.find((e) => e.id === eventId);
        if (currentEvent) {
          setEvent(currentEvent);
          // Load existing results
          if (currentEvent.results) {
            const resultsMap: { [memberId: string]: string } = {};
            Object.entries(currentEvent.results).forEach(([memberId, result]) => {
              resultsMap[memberId] = result.grossScore.toString();
            });
            setResults(resultsMap);
          }
        }
      }

      // Load members
      const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
      if (membersData) {
        const allMembers: MemberData[] = JSON.parse(membersData);
        setMembers(allMembers);

        // Filter to only selected players
        if (event?.playerIds && event.playerIds.length > 0) {
          const players = allMembers.filter((m) => event.playerIds!.includes(m.id));
          setSelectedPlayers(players);
        } else {
          // If no players selected, show all members
          setSelectedPlayers(allMembers);
        }
      }

      // Load session (single source of truth)
      const session = await getSession();
      setRole(session.role);
      
      const canEditHandicapsRole = await canEditHandicaps();
      setCanEdit(canEditHandicapsRole);
      
      if (!canEditHandicapsRole) {
        Alert.alert("Access Denied", "Access denied: Handicapper, Captain, or Admin only", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      Alert.alert("Error", "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  if (!canEdit && !loading) {
    return null; // Will redirect via Alert
  }

  const handleScoreChange = (memberId: string, value: string) => {
    setResults((prev) => ({
      ...prev,
      [memberId]: value,
    }));
  };

  const calculateWinner = (): { memberId: string; memberName: string } | null => {
    const validResults = selectedPlayers
      .map((player) => {
        const scoreStr = results[player.id];
        if (!scoreStr || scoreStr.trim() === "") return null;
        const score = parseFloat(scoreStr);
        if (isNaN(score) || score <= 0) return null;
        return { memberId: player.id, memberName: player.name, score };
      })
      .filter((item): item is { memberId: string; memberName: string; score: number } => item !== null);

    if (validResults.length === 0) return null;

    // Winner = lowest gross score
    const sorted = validResults.sort((a, b) => a.score - b.score);
    return {
      memberId: sorted[0].memberId,
      memberName: sorted[0].memberName,
    };
  };

  const handleSaveResults = async () => {
    if (!event) return;

    // Validate all scores
    const invalidScores: string[] = [];
    selectedPlayers.forEach((player) => {
      const scoreStr = results[player.id];
      if (!scoreStr || scoreStr.trim() === "") {
        invalidScores.push(player.name);
      } else {
        const score = parseFloat(scoreStr);
        if (isNaN(score) || score <= 0) {
          invalidScores.push(player.name);
        }
      }
    });

    if (invalidScores.length > 0) {
      Alert.alert(
        "Invalid Scores",
        `Please enter valid scores (numbers > 0) for: ${invalidScores.join(", ")}`
      );
      return;
    }

    try {
      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      if (!eventsData) {
        Alert.alert("Error", "Event not found");
        return;
      }

      const allEvents: EventData[] = JSON.parse(eventsData);
      const winner = calculateWinner();

      // Build results object
      const resultsObj: { [memberId: string]: { grossScore: number; netScore?: number } } = {};
      selectedPlayers.forEach((player) => {
        const scoreStr = results[player.id];
        if (scoreStr && scoreStr.trim() !== "") {
          const grossScore = parseFloat(scoreStr);
          resultsObj[player.id] = {
            grossScore,
            // netScore can be calculated later if handicap is available
          };
        }
      });

      const updatedEvents = allEvents.map((e) =>
        e.id === event.id
          ? {
              ...e,
              results: resultsObj,
              winnerId: winner?.memberId,
              winnerName: winner?.memberName,
            }
          : e
      );

      await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));
      Alert.alert("Success", winner ? `Results saved! Winner: ${winner.memberName}` : "Results saved!");
      router.back();
    } catch (error) {
      console.error("Error saving results:", error);
      Alert.alert("Error", "Failed to save results");
    }
  };

  const handleMarkCompleted = async () => {
    if (!event) return;

    Alert.alert(
      "Mark Event as Completed",
      "This will move the event to Last Event. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark Completed",
          onPress: async () => {
            try {
              const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
              if (!eventsData) {
                Alert.alert("Error", "Event not found");
                return;
              }

              const allEvents: EventData[] = JSON.parse(eventsData);
              const updatedEvents = allEvents.map((e) =>
                e.id === event.id ? { ...e, isCompleted: true } : e
              );

              await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));
              Alert.alert("Success", "Event marked as completed");
              router.back();
            } catch (error) {
              console.error("Error marking event as completed:", error);
              Alert.alert("Error", "Failed to mark event as completed");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>Event not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Enter Results</Text>
        <Text style={styles.subtitle}>{event.name}</Text>

        {selectedPlayers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No players selected for this event</Text>
            <Text style={styles.emptySubtext}>Go to Players screen to select players first</Text>
          </View>
        ) : (
          <>
            <View style={styles.resultsList}>
              {selectedPlayers.map((player) => (
                <View key={player.id} style={styles.resultCard}>
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    {player.handicap !== undefined && (
                      <Text style={styles.playerHandicap}>HCP: {player.handicap}</Text>
                    )}
                  </View>
                  <View style={styles.scoreInput}>
                    <Text style={styles.scoreLabel}>Gross Score</Text>
                    <TextInput
                      value={results[player.id] || ""}
                      onChangeText={(value) => handleScoreChange(player.id, value)}
                      placeholder="Enter score"
                      keyboardType="numeric"
                      style={styles.input}
                    />
                  </View>
                </View>
              ))}
            </View>

            <Pressable onPress={handleSaveResults} style={styles.saveButton}>
              <Text style={styles.buttonText}>Save Results</Text>
            </Pressable>

            {event.results && Object.keys(event.results).length > 0 && (
              <Pressable onPress={handleMarkCompleted} style={styles.completeButton}>
                <Text style={styles.buttonText}>Mark as Completed</Text>
              </Pressable>
            )}
          </>
        )}

        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.buttonText}>Cancel</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
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
    marginBottom: 24,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
  errorText: {
    fontSize: 16,
    color: "#ef4444",
    marginBottom: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
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
  resultsList: {
    marginBottom: 24,
  },
  resultCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  playerInfo: {
    marginBottom: 12,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  playerHandicap: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
  },
  scoreInput: {
    marginTop: 8,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    opacity: 0.7,
    color: "#111827",
  },
  input: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  saveButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  completeButton: {
    backgroundColor: "#059669",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  backButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
});

