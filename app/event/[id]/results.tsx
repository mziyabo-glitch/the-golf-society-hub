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

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View, ActivityIndicator } from "react-native";

import { getCourseHandicap, getPlayingHandicap } from "@/lib/handicap";
import { canEnterScores, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { formatDateDDMMYYYY } from "@/utils/date";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getColors, spacing } from "@/lib/ui/theme";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeEventDoc, updateEventDoc, type EventDoc } from "@/lib/db/eventRepo";
import { subscribeMembersBySociety, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeCoursesBySociety, type CourseDoc } from "@/lib/db/courseRepo";
import { subscribeTeesetsBySociety, type TeeSetDoc } from "@/lib/db/teesetRepo";

type EventData = EventDoc;
type MemberData = MemberDoc;
type CourseWithTees = CourseDoc & { teeSets: TeeSetDoc[] };

export default function EventResultsScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const { user } = useBootstrap();
  const [event, setEvent] = useState<EventData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<MemberData[]>([]);
  const [results, setResults] = useState<{ [memberId: string]: { stableford?: string; strokeplay?: string } }>({});
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingTeesets, setLoadingTeesets] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [courses, setCourses] = useState<CourseDoc[]>([]);
  const [teeSets, setTeeSets] = useState<TeeSetDoc[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseWithTees | null>(null);
  const [selectedMaleTeeSet, setSelectedMaleTeeSet] = useState<TeeSetDoc | null>(null);
  const [selectedFemaleTeeSet, setSelectedFemaleTeeSet] = useState<TeeSetDoc | null>(null);

  const coursesWithTees = useMemo<CourseWithTees[]>(
    () =>
      courses.map((course) => ({
        ...course,
        teeSets: teeSets.filter((tee) => tee.courseId === course.id),
      })),
    [courses, teeSets]
  );

  useEffect(() => {
    if (!eventId) return;
    setLoadingEvent(true);
    const unsubscribe = subscribeEventDoc(eventId, (doc) => {
      setEvent(doc);
      if (doc?.results) {
        const resultsMap: { [memberId: string]: { stableford?: string; strokeplay?: string } } = {};
        Object.entries(doc.results).forEach(([memberId, result]) => {
          resultsMap[memberId] = {
            stableford: result.stableford?.toString() || result.grossScore?.toString(),
            strokeplay: result.strokeplay?.toString() || result.grossScore?.toString(),
          };
        });
        setResults(resultsMap);
      }
      setLoadingEvent(false);
    });
    return () => unsubscribe();
  }, [eventId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }
    setLoadingMembers(true);
    const unsubscribe = subscribeMembersBySociety(user.activeSocietyId, (items) => {
      setMembers(items);
      setLoadingMembers(false);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setCourses([]);
      setTeeSets([]);
      setLoadingCourses(false);
      setLoadingTeesets(false);
      return;
    }
    setLoadingCourses(true);
    setLoadingTeesets(true);
    const unsubscribeCourses = subscribeCoursesBySociety(user.activeSocietyId, (items) => {
      setCourses(items);
      setLoadingCourses(false);
    });
    const unsubscribeTees = subscribeTeesetsBySociety(user.activeSocietyId, (items) => {
      setTeeSets(items);
      setLoadingTeesets(false);
    });
    return () => {
      unsubscribeCourses();
      unsubscribeTees();
    };
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!event) return;
    const course = coursesWithTees.find((c) => c.id === event.courseId) || null;
    setSelectedCourse(course);
    if (course && event.maleTeeSetId) {
      setSelectedMaleTeeSet(course.teeSets.find((t) => t.id === event.maleTeeSetId) || null);
    } else {
      setSelectedMaleTeeSet(null);
    }
    if (course && event.femaleTeeSetId) {
      setSelectedFemaleTeeSet(course.teeSets.find((t) => t.id === event.femaleTeeSetId) || null);
    } else {
      setSelectedFemaleTeeSet(null);
    }
  }, [coursesWithTees, event]);

  useEffect(() => {
    if (!event) return;
    if (event.playerIds && event.playerIds.length > 0) {
      const players = members.filter((m) => event.playerIds!.includes(m.id));
      setSelectedPlayers(players);
    } else {
      setSelectedPlayers(members);
    }
  }, [event, members]);

  useEffect(() => {
    const currentMember = members.find((m) => m.id === user?.activeMemberId) || null;
    const sessionRole = normalizeSessionRole("member");
    const roles = normalizeMemberRoles(currentMember?.roles);
    const canEnter = canEnterScores(sessionRole, roles);
    setCanEdit(canEnter);
    if (!canEnter) {
      Alert.alert("Access Denied", "Only Captain, Secretary, or Handicapper can enter results", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  }, [members, router, user?.activeMemberId]);

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
    
    const currentMember = members.find((m) => m.id === user?.activeMemberId) || null;
    const sessionRole = normalizeSessionRole("member");
    const roles = normalizeMemberRoles(currentMember?.roles);
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
      await updateEventDoc(event.id, {
        results: resultsObj,
        winnerId: winner?.memberId,
        winnerName: winner?.memberName,
        resultsStatus: "draft",
        resultsUpdatedAt: new Date().toISOString(),
      });
      Alert.alert("Success", "Draft saved — not counted in Order of Merit until published");
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
    
    const currentMember = members.find((m) => m.id === user?.activeMemberId) || null;
    const sessionRole = normalizeSessionRole("member");
    const roles = normalizeMemberRoles(currentMember?.roles);
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
      await updateEventDoc(event.id, {
        resultsStatus: "published",
        publishedAt: new Date().toISOString(),
        isCompleted: true,
        completedAt: new Date().toISOString(),
      });
      Alert.alert("Success", "Results published — Order of Merit updated");
      router.back();
    } catch (error) {
      console.error("Error publishing results:", error);
      Alert.alert("Error", "Failed to publish results");
    }
  };

  const colors = getColors();
  const winner = calculateWinner();
  const hasResults = event?.results && Object.keys(event.results).length > 0;
  const isPublished = event?.resultsStatus === "published";
  const isDraft = event?.resultsStatus === "draft" || (!event?.resultsStatus && hasResults);

  // Get top scores for summary
  const getTopScores = () => {
    if (!event || !hasResults) return null;
    const scores = selectedPlayers
      .map((player) => {
        const result = event.results?.[player.id];
        if (!result) return null;
        if (event.format === "Stableford" || event.format === "Both") {
          return { name: player.name, score: result.stableford ?? result.grossScore, type: "Stableford" };
        }
        if (event.format === "Strokeplay" || event.format === "Both") {
          return { name: player.name, score: result.strokeplay ?? result.grossScore, type: "Strokeplay" };
        }
        return null;
      })
      .filter((s): s is { name: string; score: number; type: string } => s !== null && s.score !== undefined);
    
    if (event.format === "Stableford" || (event.format === "Both" && scores.some(s => s.type === "Stableford"))) {
      return scores.sort((a, b) => b.score - a.score).slice(0, 3);
    }
    return scores.sort((a, b) => a.score - b.score).slice(0, 3);
  };

  const loading = loadingEvent || loadingMembers || loadingCourses || loadingTeesets;

  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState title="Event not found" message="The event you're looking for doesn't exist." />
        <SecondaryButton onPress={() => router.back()}>Back</SecondaryButton>
      </Screen>
    );
  }

  // Read-only view for users without permission
  if (!canEdit) {
    const topScores = getTopScores();
    return (
      <Screen>
        <SectionHeader title={isPublished ? "View Results" : "Results Pending"} />
        <AppText variant="caption" color="secondary" style={styles.subtitle}>
          {event.name}
        </AppText>

        {/* Summary Card */}
        {hasResults && winner && (
          <AppCard style={styles.summaryCard}>
            <AppText variant="h2" style={styles.summaryTitle}>
              Winner
            </AppText>
            <AppText variant="h1" style={{ color: colors.primary, marginVertical: spacing.sm }}>
              {winner.memberName}
            </AppText>
            {topScores && topScores.length > 0 && (
              <View style={styles.topScores}>
                <AppText variant="bodyBold" style={styles.topScoresTitle}>
                  Top {Math.min(3, topScores.length)}:
                </AppText>
                {topScores.map((s, idx) => (
                  <AppText key={idx} variant="body" color="secondary">
                    {idx + 1}. {s.name} — {s.score}
                  </AppText>
                ))}
              </View>
            )}
          </AppCard>
        )}

        {!hasResults ? (
          <EmptyState
            title="Results Pending"
            message="Results will be entered by the Handicapper/ManCo after the round."
          />
        ) : (
          <>
            {selectedPlayers.map((player) => {
              const playerResult = event.results?.[player.id];
              if (!playerResult) return null;

              const ch = getCourseHandicap(player, selectedMaleTeeSet, selectedFemaleTeeSet);
              const ph = getPlayingHandicap(player, event, selectedCourse, selectedMaleTeeSet, selectedFemaleTeeSet);

              return (
                <AppCard key={player.id} style={styles.resultCard}>
                  <AppText variant="bodyBold">{player.name}</AppText>
                  <View style={styles.handicapInfo}>
                    {player.handicap !== undefined && (
                      <AppText variant="small" color="secondary">
                        HI: {player.handicap}
                      </AppText>
                    )}
                    {ch !== null && (
                      <AppText variant="small" color="secondary">
                        {" | "}CH: {ch}
                      </AppText>
                    )}
                    {ph !== null && (
                      <AppText variant="small" color="secondary">
                        {" | "}PH: {ph}
                      </AppText>
                    )}
                  </View>
                  <View style={styles.scoreDisplay}>
                    {event.format === "Stableford" || event.format === "Both" ? (
                      <AppText variant="body">
                        Stableford: {playerResult.stableford ?? playerResult.grossScore ?? "N/A"}
                      </AppText>
                    ) : null}
                    {event.format === "Strokeplay" || event.format === "Both" ? (
                      <AppText variant="body">
                        Strokeplay: {playerResult.strokeplay ?? playerResult.grossScore ?? "N/A"}
                      </AppText>
                    ) : null}
                  </View>
                </AppCard>
              );
            })}
          </>
        )}

        <SecondaryButton onPress={() => router.back()}>Back</SecondaryButton>
      </Screen>
    );
  }

  const topScores = getTopScores();

  return (
    <Screen>
      <SectionHeader title="Enter Results" />
      <AppText variant="caption" color="secondary" style={styles.subtitle}>
        {event.name}
      </AppText>
      {isDraft && (
        <AppCard style={styles.draftHelper}>
          <AppText variant="small" color="secondary">
            Draft — not counted in Order of Merit until published.
          </AppText>
        </AppCard>
      )}

      {/* Summary Card */}
      {hasResults && winner && (
        <AppCard style={styles.summaryCard}>
          <AppText variant="h2" style={styles.summaryTitle}>
            Current Winner
          </AppText>
          <AppText variant="h1" style={{ color: colors.primary, marginVertical: spacing.sm }}>
            {winner.memberName}
          </AppText>
          {topScores && topScores.length > 0 && (
            <View style={styles.topScores}>
              <AppText variant="bodyBold" style={styles.topScoresTitle}>
                Top {Math.min(3, topScores.length)}:
              </AppText>
              {topScores.map((s, idx) => (
                <AppText key={idx} variant="body" color="secondary">
                  {idx + 1}. {s.name} — {s.score}
                </AppText>
              ))}
            </View>
          )}
        </AppCard>
      )}

      {selectedPlayers.length === 0 ? (
        <EmptyState
          title="No players selected"
          message="Go to Players screen to select players first"
        />
      ) : (
        <>
          {selectedPlayers.map((player) => {
            const ch = getCourseHandicap(player, selectedMaleTeeSet, selectedFemaleTeeSet);
            const ph = getPlayingHandicap(player, event, selectedCourse, selectedMaleTeeSet, selectedFemaleTeeSet);

            return (
              <AppCard key={player.id} style={styles.resultCard}>
                <AppText variant="bodyBold">{player.name}</AppText>
                <View style={styles.handicapInfo}>
                  {player.handicap !== undefined && (
                    <AppText variant="small" color="secondary">
                      HI: {player.handicap}
                    </AppText>
                  )}
                  {ch !== null && (
                    <AppText variant="small" color="secondary">
                      {" | "}CH: {ch}
                    </AppText>
                  )}
                  {ph !== null && (
                    <AppText variant="small" color="secondary">
                      {" | "}PH: {ph}
                    </AppText>
                  )}
                </View>
                {(event.format === "Stableford" || event.format === "Both") && (
                  <View style={styles.scoreInput}>
                    <AppText variant="caption" style={styles.scoreLabel}>
                      Stableford Points (0-60)
                    </AppText>
                    <TextInput
                      value={results[player.id]?.stableford || ""}
                      onChangeText={(value) => handleScoreChange(player.id, "stableford", value)}
                      placeholder="Enter points"
                      keyboardType="numeric"
                      editable={canEdit}
                      style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                    />
                  </View>
                )}
                {(event.format === "Strokeplay" || event.format === "Both") && (
                  <View style={styles.scoreInput}>
                    <AppText variant="caption" style={styles.scoreLabel}>
                      Strokeplay Gross (50-200)
                    </AppText>
                    <TextInput
                      value={results[player.id]?.strokeplay || ""}
                      onChangeText={(value) => handleScoreChange(player.id, "strokeplay", value)}
                      placeholder="Enter score"
                      keyboardType="numeric"
                      editable={canEdit}
                      style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                    />
                    {(() => {
                      const handicap = event.handicapSnapshot?.[player.id] ?? player.handicap;
                      const strokeplay = results[player.id]?.strokeplay;
                      if (handicap !== undefined && strokeplay) {
                        return (
                          <AppText variant="small" color="secondary" style={styles.netScoreLabel}>
                            Net: {parseInt(strokeplay || "0", 10) - handicap}
                          </AppText>
                        );
                      }
                      return null;
                    })()}
                  </View>
                )}
              </AppCard>
            );
          })}

          <PrimaryButton onPress={handleSaveResults} disabled={!canEdit} style={styles.actionButton}>
            Save Draft
          </PrimaryButton>

          {isDraft && canEdit && (
            <PrimaryButton onPress={handlePublishResults} style={styles.actionButton}>
              Publish Results
            </PrimaryButton>
          )}
        </>
      )}

      <SecondaryButton onPress={() => router.back()}>Cancel</SecondaryButton>
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
  topScores: {
    marginTop: spacing.sm,
  },
  topScoresTitle: {
    marginBottom: spacing.xs,
  },
  draftHelper: {
    marginBottom: spacing.base,
  },
  resultCard: {
    marginBottom: spacing.base,
  },
  handicapInfo: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.xs,
  },
  scoreInput: {
    marginTop: spacing.base,
  },
  scoreLabel: {
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    fontSize: 16,
    minHeight: 44,
  },
  scoreDisplay: {
    marginTop: spacing.sm,
  },
  netScoreLabel: {
    marginTop: spacing.xs,
  },
  actionButton: {
    marginBottom: spacing.base,
  },
});

