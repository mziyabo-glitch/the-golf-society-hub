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
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getCourseHandicap, getPlayingHandicap } from "@/lib/handicap";
import type { Course, TeeSet, MemberData as MemberDataType } from "@/lib/models";
import { canEnterScores, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { STORAGE_KEYS } from "@/lib/storage";
import { formatDateDDMMYYYY } from "@/utils/date";

const EVENTS_KEY = STORAGE_KEYS.EVENTS;
const MEMBERS_KEY = STORAGE_KEYS.MEMBERS;
const COURSES_KEY = STORAGE_KEYS.COURSES;

type EventData = {
  id: string;
  name: string;
  date: string;
  courseName: string;
  courseId?: string;
  maleTeeSetId?: string;
  femaleTeeSetId?: string;
  handicapAllowance?: 0.9 | 1.0;
  handicapAllowancePct?: number;
  format: "Stableford" | "Strokeplay" | "Both";
  playerIds?: string[];
  isCompleted?: boolean;
  completedAt?: string;
  resultsStatus?: "draft" | "published";
  publishedAt?: string;
  resultsUpdatedAt?: string;
  isOOM?: boolean;
  winnerId?: string;
  winnerName?: string;
  handicapSnapshot?: { [memberId: string]: number };
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
  sex?: "male" | "female";
};

export default function EventResultsScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<MemberData[]>([]);
  const [results, setResults] = useState<{ [memberId: string]: { stableford?: string; strokeplay?: string } }>({});
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"admin" | "member">("member");
  const [canEdit, setCanEdit] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedMaleTeeSet, setSelectedMaleTeeSet] = useState<TeeSet | null>(null);
  const [selectedFemaleTeeSet, setSelectedFemaleTeeSet] = useState<TeeSet | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [eventId])
  );

  const loadData = async () => {
    try {
      // Load courses
      const coursesData = await AsyncStorage.getItem(COURSES_KEY);
      let loadedCourses: Course[] = [];
      if (coursesData) {
        loadedCourses = JSON.parse(coursesData);
        setCourses(loadedCourses);
      }

      // Load event
      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      let currentEvent: EventData | null = null;
      if (eventsData) {
        const allEvents: EventData[] = JSON.parse(eventsData);
        currentEvent = allEvents.find((e) => e.id === eventId) || null;
        if (currentEvent) {
          setEvent(currentEvent);
          // Load existing results
          if (currentEvent.results) {
            const resultsMap: { [memberId: string]: { stableford?: string; strokeplay?: string } } = {};
            Object.entries(currentEvent.results).forEach(([memberId, result]) => {
              resultsMap[memberId] = {
                stableford: result.stableford?.toString() || result.grossScore?.toString(),
                strokeplay: result.strokeplay?.toString() || result.grossScore?.toString(),
              };
            });
            setResults(resultsMap);
          }

          // Load course and tee sets
          if (currentEvent.courseId) {
            const course = loadedCourses.find((c) => c.id === currentEvent!.courseId);
            if (course) {
              setSelectedCourse(course);
              if (currentEvent.maleTeeSetId) {
                const maleTee = course.teeSets.find((t) => t.id === currentEvent!.maleTeeSetId);
                setSelectedMaleTeeSet(maleTee || null);
              }
              if (currentEvent.femaleTeeSetId) {
                const femaleTee = course.teeSets.find((t) => t.id === currentEvent!.femaleTeeSetId);
                setSelectedFemaleTeeSet(femaleTee || null);
              }
            }
          }
        }
      }

      // Load members
      const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
      if (membersData) {
        const allMembers: MemberData[] = JSON.parse(membersData);
        setMembers(allMembers);

        // Filter to only selected players (use currentEvent from above, not event state)
        if (currentEvent?.playerIds && currentEvent.playerIds.length > 0) {
          const players = allMembers.filter((m) => currentEvent!.playerIds!.includes(m.id));
          setSelectedPlayers(players);
        } else {
          // If no players selected, show all members
          setSelectedPlayers(allMembers);
        }
      }

      // Load session (single source of truth)
      const session = await getSession();
      setRole(session.role);
      
      // Check permissions using pure functions
      const sessionRole = normalizeSessionRole(session.role);
      const roles = normalizeMemberRoles(await getCurrentUserRoles());
      const canEnter = canEnterScores(sessionRole, roles);
      setCanEdit(canEnter);
      
      // Block unauthorized access - redirect if not authorized
      if (!canEnter) {
        Alert.alert("Access Denied", "Only Captain, Secretary, or Handicapper can enter results", [
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

  // Constants for validation
  const STABLEFORD_MIN = 0;
  const STABLEFORD_MAX = 60;
  const STROKEPLAY_MIN = 50;
  const STROKEPLAY_MAX = 200;

  const handleScoreChange = (memberId: string, field: "stableford" | "strokeplay", value: string) => {
    setResults((prev) => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        [field]: value,
      },
    }));
  };

  const calculateWinner = (): { memberId: string; memberName: string } | null => {
    if (!event) return null;
    
    const validResults = selectedPlayers
      .map((player) => {
        const playerResults = results[player.id];
        if (!playerResults) return null;
        
        let score: number | null = null;
        let useStableford = false;
        
        if (event.format === "Stableford" && playerResults.stableford) {
          const s = parseInt(playerResults.stableford, 10);
          if (!isNaN(s) && s >= STABLEFORD_MIN && s <= STABLEFORD_MAX) {
            score = s;
            useStableford = true;
          }
        } else if (event.format === "Strokeplay" && playerResults.strokeplay) {
          const s = parseInt(playerResults.strokeplay, 10);
          if (!isNaN(s) && s >= STROKEPLAY_MIN && s <= STROKEPLAY_MAX) {
            score = s;
            useStableford = false;
          }
        } else if (event.format === "Both") {
          // Prefer Stableford if available, otherwise Strokeplay
          if (playerResults.stableford) {
            const s = parseInt(playerResults.stableford, 10);
            if (!isNaN(s) && s >= STABLEFORD_MIN && s <= STABLEFORD_MAX) {
              score = s;
              useStableford = true;
            }
          } else if (playerResults.strokeplay) {
            const s = parseInt(playerResults.strokeplay, 10);
            if (!isNaN(s) && s >= STROKEPLAY_MIN && s <= STROKEPLAY_MAX) {
              score = s;
              useStableford = false;
            }
          }
        }
        
        if (score === null) return null;
        return { memberId: player.id, memberName: player.name, score, useStableford };
      })
      .filter((item): item is { memberId: string; memberName: string; score: number; useStableford: boolean } => item !== null);

    if (validResults.length === 0) return null;

    // Winner: highest Stableford, lowest Strokeplay
    const sorted = validResults.sort((a, b) => {
      if (a.useStableford) {
        return b.score - a.score; // Higher is better for Stableford
      } else {
        return a.score - b.score; // Lower is better for Strokeplay
      }
    });
    return {
      memberId: sorted[0].memberId,
      memberName: sorted[0].memberName,
    };
  };

  const handleSaveResults = async () => {
    if (!event) {
      Alert.alert("Error", "Event not found");
      return;
    }
    
    // Double-check permission at write time (defense in depth)
    const session = await getSession();
    const sessionRole = normalizeSessionRole(session.role);
    const roles = normalizeMemberRoles(await getCurrentUserRoles());
    const canEnter = canEnterScores(sessionRole, roles);
    
    if (!canEnter) {
      Alert.alert("Access Denied", "Only Captain, Secretary, or Handicapper can enter results");
      return;
    }

    // Validate all scores based on event format
    const invalidScores: string[] = [];
    selectedPlayers.forEach((player) => {
      const playerResults = results[player.id];
      if (!playerResults) {
        invalidScores.push(player.name);
        return;
      }
      
      if (event.format === "Stableford") {
        const scoreStr = playerResults.stableford;
        if (!scoreStr || scoreStr.trim() === "") {
          invalidScores.push(player.name);
        } else {
          const score = parseInt(scoreStr, 10);
          if (isNaN(score) || score < STABLEFORD_MIN || score > STABLEFORD_MAX) {
            invalidScores.push(`${player.name} (Stableford: ${scoreStr})`);
          }
        }
      } else if (event.format === "Strokeplay") {
        const scoreStr = playerResults.strokeplay;
        if (!scoreStr || scoreStr.trim() === "") {
          invalidScores.push(player.name);
        } else {
          const score = parseInt(scoreStr, 10);
          if (isNaN(score) || score < STROKEPLAY_MIN || score > STROKEPLAY_MAX) {
            invalidScores.push(`${player.name} (Strokeplay: ${scoreStr})`);
          }
        }
      } else if (event.format === "Both") {
        // Both formats require at least one score
        const stableford = playerResults.stableford;
        const strokeplay = playerResults.strokeplay;
        if ((!stableford || stableford.trim() === "") && (!strokeplay || strokeplay.trim() === "")) {
          invalidScores.push(player.name);
        } else {
          if (stableford && stableford.trim() !== "") {
            const score = parseInt(stableford, 10);
            if (isNaN(score) || score < STABLEFORD_MIN || score > STABLEFORD_MAX) {
              invalidScores.push(`${player.name} (Stableford: ${stableford})`);
            }
          }
          if (strokeplay && strokeplay.trim() !== "") {
            const score = parseInt(strokeplay, 10);
            if (isNaN(score) || score < STROKEPLAY_MIN || score > STROKEPLAY_MAX) {
              invalidScores.push(`${player.name} (Strokeplay: ${strokeplay})`);
            }
          }
        }
      }
    });

    if (invalidScores.length > 0) {
      Alert.alert(
        "Invalid Scores",
        `Please enter valid scores for: ${invalidScores.join(", ")}\n\nStableford: ${STABLEFORD_MIN}-${STABLEFORD_MAX}\nStrokeplay: ${STROKEPLAY_MIN}-${STROKEPLAY_MAX}`
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

      // Build results object with format-specific scores
      const resultsObj: { [memberId: string]: { grossScore: number; stableford?: number; strokeplay?: number; netScore?: number } } = {};
      selectedPlayers.forEach((player) => {
        const playerResults = results[player.id];
        if (!playerResults) return;
        
        const result: { grossScore: number; stableford?: number; strokeplay?: number; netScore?: number } = {
          grossScore: 0, // Will be set from strokeplay or calculated
        };
        
        if (playerResults.stableford && playerResults.stableford.trim() !== "") {
          const stablefordScore = parseInt(playerResults.stableford, 10);
          if (!isNaN(stablefordScore)) {
            result.stableford = stablefordScore;
            // For "Both" format, use strokeplay as grossScore if available
            if (event.format === "Both" && playerResults.strokeplay) {
              const strokeplayScore = parseInt(playerResults.strokeplay, 10);
              if (!isNaN(strokeplayScore)) {
                result.grossScore = strokeplayScore;
                result.strokeplay = strokeplayScore;
              }
            }
          }
        }
        
        if (playerResults.strokeplay && playerResults.strokeplay.trim() !== "") {
          const strokeplayScore = parseInt(playerResults.strokeplay, 10);
          if (!isNaN(strokeplayScore)) {
            result.strokeplay = strokeplayScore;
            result.grossScore = strokeplayScore; // Gross score is strokeplay
          }
        }
        
        // Calculate net score using handicap snapshot if available, otherwise current handicap
        const handicap = event.handicapSnapshot?.[player.id] ?? player.handicap;
        if (handicap !== undefined && result.strokeplay) {
          result.netScore = result.strokeplay - handicap;
        }
        
        if (result.grossScore > 0 || result.stableford !== undefined) {
          resultsObj[player.id] = result;
        }
      });

      // Save as DRAFT only (not published)
      const updatedEvents = allEvents.map((e) =>
        e.id === event.id
          ? {
              ...e,
              results: resultsObj,
              winnerId: winner?.memberId,
              winnerName: winner?.memberName,
              resultsStatus: "draft" as const,
              resultsUpdatedAt: new Date().toISOString(),
              // Don't mark as completed until published
            }
          : e
      );

      await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));
      Alert.alert("Success", "Draft saved — not counted in OOM until published");
      router.back();
    } catch (error) {
      console.error("Error saving results:", error);
      Alert.alert("Error", "Failed to save results");
    }
  };

  const handlePublishResults = async () => {
    if (!event) {
      Alert.alert("Error", "Event not found");
      return;
    }
    
    // Double-check permission at write time
    const session = await getSession();
    const sessionRole = normalizeSessionRole(session.role);
    const roles = normalizeMemberRoles(await getCurrentUserRoles());
    const canEnter = canEnterScores(sessionRole, roles);
    
    if (!canEnter) {
      Alert.alert("Access Denied", "Only Captain, Secretary, or Handicapper can publish results");
      return;
    }

    // Validate that results exist
    if (!event.results || Object.keys(event.results).length === 0) {
      Alert.alert("Cannot Publish", "Please enter scores before publishing");
      return;
    }

    // Validate required players have scores
    const missingScores: string[] = [];
    selectedPlayers.forEach((player) => {
      if (!event.results?.[player.id]) {
        missingScores.push(player.name);
      }
    });

    if (missingScores.length > 0) {
      Alert.alert(
        "Cannot Publish",
        `Please enter scores for all players: ${missingScores.join(", ")}`
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
      const updatedEvents = allEvents.map((e) =>
        e.id === event.id
          ? {
              ...e,
              resultsStatus: "published" as const,
              publishedAt: new Date().toISOString(),
              isCompleted: true,
              completedAt: new Date().toISOString(),
            }
          : e
      );

      await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));
      Alert.alert("Success", "Results published — OOM updated");
      router.back();
    } catch (error) {
      console.error("Error publishing results:", error);
      Alert.alert("Error", "Failed to publish results");
    }
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

  // Read-only view for users without permission
  if (!canEdit) {
    const hasResults = event.results && Object.keys(event.results).length > 0;
    const isPublished = event.resultsStatus === "published";
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>{isPublished ? "View Results" : "Results Pending"}</Text>
          <Text style={styles.subtitle}>{event.name}</Text>
          
          {!hasResults && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Results will be entered by the Handicapper/ManCo after the round.</Text>
            </View>
          )}
          
          {hasResults ? (
            <View style={styles.resultsList}>
              {selectedPlayers.map((player) => {
                const playerResult = event.results?.[player.id];
                if (!playerResult) return null;
                
                return (
                  <View key={player.id} style={[styles.resultCard, styles.readOnlyCard]}>
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{player.name}</Text>
                      {(() => {
                        const ch = getCourseHandicap(player, selectedMaleTeeSet, selectedFemaleTeeSet);
                        const ph = getPlayingHandicap(player, event, selectedCourse, selectedMaleTeeSet, selectedFemaleTeeSet);
                        return (
                          <View style={styles.handicapInfo}>
                            {player.handicap !== undefined && (
                              <Text style={styles.playerHandicap}>HI: {player.handicap}</Text>
                            )}
                            {ch !== null && (
                              <Text style={styles.playerHandicap}> | CH: {ch}</Text>
                            )}
                            {ph !== null && (
                              <Text style={styles.playerHandicap}> | PH: {ph}</Text>
                            )}
                          </View>
                        );
                      })()}
                    </View>
                    <View style={styles.scoreInput}>
                      {event.format === "Stableford" || event.format === "Both" ? (
                        <Text style={styles.scoreLabel}>
                          Stableford: {playerResult.stableford ?? playerResult.grossScore ?? "N/A"}
                        </Text>
                      ) : null}
                      {event.format === "Strokeplay" || event.format === "Both" ? (
                        <Text style={styles.scoreLabel}>
                          Strokeplay: {playerResult.strokeplay ?? playerResult.grossScore ?? "N/A"}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Results will be entered by the Handicapper/ManCo after the round.</Text>
            </View>
          )}
          
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.buttonText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const isDraft = event.resultsStatus === "draft" || (!event.resultsStatus && event.results);
  const isPublished = event.resultsStatus === "published";

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Enter Results</Text>
        <Text style={styles.subtitle}>{event.name}</Text>
        {isDraft && (
          <Text style={styles.draftHelper}>Draft — not counted in OOM until published.</Text>
        )}

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
                    {(() => {
                      const ch = getCourseHandicap(player, selectedMaleTeeSet, selectedFemaleTeeSet);
                      const ph = getPlayingHandicap(player, event, selectedCourse, selectedMaleTeeSet, selectedFemaleTeeSet);
                      return (
                        <View style={styles.handicapInfo}>
                          {player.handicap !== undefined && (
                            <Text style={styles.playerHandicap}>HI: {player.handicap}</Text>
                          )}
                          {ch !== null && (
                            <Text style={styles.playerHandicap}> | CH: {ch}</Text>
                          )}
                          {ph !== null && (
                            <Text style={styles.playerHandicap}> | PH: {ph}</Text>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                  {(event.format === "Stableford" || event.format === "Both") && (
                    <View style={styles.scoreInput}>
                      <Text style={styles.scoreLabel}>Stableford Points (0-60)</Text>
                      <TextInput
                        value={results[player.id]?.stableford || ""}
                        onChangeText={(value) => handleScoreChange(player.id, "stableford", value)}
                        placeholder="Enter points"
                        keyboardType="numeric"
                        editable={canEdit}
                        style={[styles.input, !canEdit && styles.inputReadOnly]}
                      />
                    </View>
                  )}
                  {(event.format === "Strokeplay" || event.format === "Both") && (
                    <View style={styles.scoreInput}>
                      <Text style={styles.scoreLabel}>Strokeplay Gross (50-200)</Text>
                      <TextInput
                        value={results[player.id]?.strokeplay || ""}
                        onChangeText={(value) => handleScoreChange(player.id, "strokeplay", value)}
                        placeholder="Enter score"
                        keyboardType="numeric"
                        editable={canEdit}
                        style={[styles.input, !canEdit && styles.inputReadOnly]}
                      />
                      {(() => {
                        const handicap = event.handicapSnapshot?.[player.id] ?? player.handicap;
                        const strokeplay = results[player.id]?.strokeplay;
                        if (handicap !== undefined && strokeplay) {
                          return (
                            <Text style={styles.netScoreLabel}>
                              Net: {parseInt(strokeplay || "0", 10) - handicap}
                            </Text>
                          );
                        }
                        return null;
                      })()}
                    </View>
                  )}
                </View>
              ))}
            </View>

            <Pressable onPress={handleSaveResults} style={styles.saveButton} disabled={!canEdit}>
              <Text style={styles.buttonText}>Save Draft</Text>
            </Pressable>

            {isDraft && canEdit && (
              <Pressable onPress={handlePublishResults} style={styles.publishButton}>
                <Text style={styles.buttonText}>Publish Results</Text>
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
  handicapInfo: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
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
  inputReadOnly: {
    backgroundColor: "#f3f4f6",
    opacity: 0.6,
  },
  readOnlyCard: {
    opacity: 0.8,
  },
  netScoreLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
    fontStyle: "italic",
  },
  saveButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  publishButton: {
    backgroundColor: "#059669",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  draftHelper: {
    fontSize: 12,
    color: "#6b7280",
    fontStyle: "italic",
    marginBottom: 16,
    padding: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
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

