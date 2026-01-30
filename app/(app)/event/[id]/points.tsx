/**
 * Event Points Entry Screen
 * - Enter Order of Merit points for players in an event
 * - Captain/Handicapper only
 * - F1-style points: 25,18,15,12,10,8,6,4,2,1 for positions 1-10
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import {
  upsertEventResults,
  getEventResults,
  type EventResultDoc,
} from "@/lib/db_supabase/resultsRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";

// F1-style points: positions 1-10 get points, rest get 0
const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const VALID_F1_POINTS = new Set([0, ...F1_POINTS]); // 0, 1, 2, 4, 6, 8, 10, 12, 15, 18, 25

// Reverse map: points → position
const POINTS_TO_POSITION: Record<number, number> = {
  25: 1, 18: 2, 15: 3, 12: 4, 10: 5,
  8: 6, 6: 7, 4: 8, 2: 9, 1: 10,
};

function getF1Points(position: number): number {
  if (position >= 1 && position <= 10) {
    return F1_POINTS[position - 1];
  }
  return 0;
}

function getPositionFromF1Points(points: number): number | null {
  return POINTS_TO_POSITION[points] ?? null;
}

function isValidF1Points(points: number): boolean {
  return VALID_F1_POINTS.has(points);
}

type PlayerPoints = {
  memberId: string;
  memberName: string;
  points: string; // String for input handling
  finishPosition: string; // For F1 auto-assign
  stablefordScore?: number; // From event results if available
  netScore?: number; // From event results if available
};

export default function EventPointsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { societyId, member: currentMember, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const eventId = useMemo(() => {
    const raw = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [existingResults, setExistingResults] = useState<EventResultDoc[]>([]);
  const [playerPoints, setPlayerPoints] = useState<PlayerPoints[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permissions = getPermissionsForMember(currentMember as any);
  const canEnterPoints = permissions.canManageHandicaps;

  const loadData = useCallback(async () => {
    if (bootstrapLoading) return;

    if (!societyId) {
      setError("Missing society");
      setLoading(false);
      return;
    }

    if (!eventId) {
      setError("Missing event ID");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("[points] loading event + members + results", { eventId, societyId });

      const [evt, mems, results] = await Promise.all([
        getEvent(eventId),
        getMembersBySocietyId(societyId),
        getEventResults(eventId),
      ]);

      if (!evt) {
        setError("Event not found");
        setLoading(false);
        return;
      }

      console.log("[points] loaded:", {
        eventName: evt.name,
        playerIds: evt.playerIds,
        memberCount: mems.length,
        existingResultsCount: results.length,
      });

      setEvent(evt);
      setMembers(mems);
      setExistingResults(results);

      // Build player points list from event's playerIds
      const playerIds = evt.playerIds ?? [];
      const memberMap = new Map(mems.map((m) => [m.id, m]));
      const resultMap = new Map(results.map((r) => [r.member_id, r]));

      // Get event results (stableford/net scores) if available
      const eventResults = evt.results ?? {};

      const points: PlayerPoints[] = playerIds.map((pid, index) => {
        const member = memberMap.get(pid);
        const existing = resultMap.get(pid);
        const playerResult = eventResults[pid] as { stableford?: number; netScore?: number } | undefined;
        return {
          memberId: pid,
          memberName: member?.displayName || member?.name || "Unknown",
          points: existing?.points != null ? String(existing.points) : "",
          finishPosition: "", // Will be set by user or auto-computed
          stablefordScore: playerResult?.stableford,
          netScore: playerResult?.netScore,
        };
      });

      setPlayerPoints(points);
    } catch (e: any) {
      console.error("[points] load FAILED", e);
      setError(e?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [bootstrapLoading, societyId, eventId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updatePoints = (memberId: string, value: string) => {
    setPlayerPoints((prev) =>
      prev.map((p) => {
        if (p.memberId !== memberId) return p;

        // Auto-fill position when valid F1 points are entered
        const num = parseInt(value.trim(), 10);
        const position = !isNaN(num) ? getPositionFromF1Points(num) : null;

        return {
          ...p,
          points: value,
          finishPosition: position ? String(position) : p.finishPosition,
        };
      })
    );
  };

  const updateFinishPosition = (memberId: string, value: string) => {
    setPlayerPoints((prev) =>
      prev.map((p) => (p.memberId === memberId ? { ...p, finishPosition: value } : p))
    );
  };

  /**
   * Auto-assign F1 points based on finish positions entered by user
   * F1 points: 25,18,15,12,10,8,6,4,2,1 for positions 1-10
   */
  const autoAssignF1FromPositions = () => {
    // Check if any positions are entered
    const withPositions = playerPoints.filter((p) => p.finishPosition.trim() !== "");

    if (withPositions.length === 0) {
      Alert.alert(
        "Enter Finish Positions",
        "Please enter finish positions (1, 2, 3...) for each player first, then tap Auto-assign."
      );
      return;
    }

    // Validate positions are numbers
    for (const p of withPositions) {
      const pos = parseInt(p.finishPosition.trim(), 10);
      if (isNaN(pos) || pos < 1) {
        Alert.alert(
          "Invalid Position",
          `Position for ${p.memberName} must be a positive number (1, 2, 3...).`
        );
        return;
      }
    }

    // Assign F1 points based on position
    setPlayerPoints((prev) =>
      prev.map((p) => {
        const pos = parseInt(p.finishPosition.trim(), 10);
        if (!isNaN(pos) && pos >= 1) {
          return { ...p, points: String(getF1Points(pos)) };
        }
        return { ...p, points: "0" }; // No position = 0 points
      })
    );

    Alert.alert("Points Assigned", "F1 points have been assigned based on finish positions. Review and save.");
  };

  /**
   * Auto-compute ranking from event scores (stableford or medal)
   * Then assign F1 points to top 10
   */
  const autoAssignF1FromScores = () => {
    if (!event) return;

    // Check if we have scores to rank from
    const withScores = playerPoints.filter(
      (p) => p.stablefordScore != null || p.netScore != null
    );

    if (withScores.length === 0) {
      Alert.alert(
        "No Scores Available",
        "This event doesn't have stableford or net scores recorded. Please enter finish positions manually instead."
      );
      return;
    }

    // Sort based on event format
    const format = event.format?.toLowerCase() || "stableford";
    let sorted: PlayerPoints[];

    if (format === "medal" || format === "strokeplay") {
      // Medal: lowest net score wins
      sorted = [...playerPoints].sort((a, b) => {
        const aScore = a.netScore ?? Infinity;
        const bScore = b.netScore ?? Infinity;
        return aScore - bScore;
      });
    } else {
      // Stableford (default): highest stableford wins
      sorted = [...playerPoints].sort((a, b) => {
        const aScore = a.stablefordScore ?? -Infinity;
        const bScore = b.stablefordScore ?? -Infinity;
        return bScore - aScore;
      });
    }

    // Assign finish positions (handling ties with same score = same position)
    let currentPosition = 1;
    const positionedPlayers = sorted.map((p, index) => {
      if (index > 0) {
        const prevPlayer = sorted[index - 1];
        const prevScore = format === "medal" ? prevPlayer.netScore : prevPlayer.stablefordScore;
        const currScore = format === "medal" ? p.netScore : p.stablefordScore;
        if (currScore !== prevScore) {
          currentPosition = index + 1;
        }
      }
      return { ...p, finishPosition: String(currentPosition) };
    });

    // Assign F1 points
    const withPoints = positionedPlayers.map((p) => {
      const pos = parseInt(p.finishPosition, 10);
      return { ...p, points: String(getF1Points(pos)) };
    });

    setPlayerPoints(withPoints);
    Alert.alert(
      "Points Assigned",
      `F1 points assigned based on ${format === "medal" ? "net score (low wins)" : "stableford (high wins)"}. Review and save.`
    );
  };

  const handleSave = async () => {
    if (!event || !societyId) return;

    // Validate points are valid numbers
    for (const p of playerPoints) {
      if (p.points.trim() !== "") {
        const num = parseInt(p.points.trim(), 10);
        if (isNaN(num) || num < 0) {
          Alert.alert(
            "Invalid Points",
            `Points for ${p.memberName} must be a non-negative number.`
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      console.log("[points] saving results for event:", event.id);

      // Build results array (only include entries with points)
      const results = playerPoints
        .filter((p) => p.points.trim() !== "")
        .map((p) => ({
          member_id: p.memberId,
          points: parseInt(p.points.trim(), 10),
        }));

      console.log("[points] upserting", results.length, "results");

      await upsertEventResults(event.id, societyId, results);

      console.log("[points] save OK");

      // Navigate back - leaderboard will refetch via useFocusEffect
      router.back();
    } catch (e: any) {
      console.error("[points] save FAILED", e);
      Alert.alert("Save Failed", e?.message ?? "Failed to save points");
    } finally {
      setSaving(false);
    }
  };

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState label="Loading..." />
      </Screen>
    );
  }

  // Permission check
  if (!canEnterPoints) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => router.back()} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} />
            {" Back"}
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="lock" size={24} color={colors.error} />}
          title="No Access"
          message="Only Captain or Handicapper can enter points for Order of Merit events."
          action={{ label: "Go Back", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => router.back()} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} />
            {" Back"}
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="alert-circle" size={24} color={colors.error} />}
          title="Error"
          message={error}
          action={{ label: "Go Back", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState
          title="Not Found"
          message="Event not found."
          action={{ label: "Go Back", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  // Check if this is an OOM event
  const isOOM = event.classification === "oom" || event.isOOM === true;

  if (!isOOM) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => router.back()} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} />
            {" Back"}
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="info" size={24} color={colors.textTertiary} />}
          title="Not an Order of Merit Event"
          message="Points can only be entered for Order of Merit events. Edit the event and change its classification to 'Order of Merit' to enable points entry."
          action={{ label: "Go Back", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} />
          {" Back"}
        </SecondaryButton>

        <View style={{ flex: 1 }} />

        <PrimaryButton onPress={handleSave} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save"}
        </PrimaryButton>
      </View>

      <AppText variant="h2" style={{ marginBottom: spacing.xs }}>
        Enter Points
      </AppText>
      <AppText variant="body" color="secondary" style={{ marginBottom: spacing.lg }}>
        {event.name}
      </AppText>

      {playerPoints.length === 0 ? (
        <EmptyState
          icon={<Feather name="user-plus" size={24} color={colors.primary} />}
          title="Select Players First"
          message="Before entering points, you need to select which players participated in this event. Tap the button below to manage the player list."
          action={{
            label: "Select Players",
            onPress: () =>
              router.push({
                pathname: "/(app)/event/[id]/players",
                params: { id: eventId },
              }),
          }}
        />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
        >
          {/* F1 Auto-assign buttons */}
          <AppCard style={styles.f1Card}>
            <AppText variant="bodyBold" style={{ marginBottom: spacing.xs }}>
              F1-Style Points (Top 10)
            </AppText>
            <AppText variant="caption" color="secondary" style={{ marginBottom: spacing.sm }}>
              25, 18, 15, 12, 10, 8, 6, 4, 2, 1 for positions 1-10
            </AppText>
            <View style={styles.f1ButtonRow}>
              <SecondaryButton onPress={autoAssignF1FromPositions} size="sm" style={{ flex: 1 }}>
                <Feather name="hash" size={14} color={colors.text} />
                {" From Positions"}
              </SecondaryButton>
              <SecondaryButton onPress={autoAssignF1FromScores} size="sm" style={{ flex: 1 }}>
                <Feather name="zap" size={14} color={colors.text} />
                {" From Scores"}
              </SecondaryButton>
            </View>
          </AppCard>

          {/* Column headers */}
          <View style={styles.columnHeaders}>
            <View style={{ width: 32 }} />
            <AppText variant="caption" color="tertiary" style={{ flex: 1 }}>
              Player
            </AppText>
            <AppText variant="caption" color="tertiary" style={{ width: 50, textAlign: "center" }}>
              Pos
            </AppText>
            <AppText variant="caption" color="tertiary" style={{ width: 70, textAlign: "center" }}>
              Points
            </AppText>
          </View>

          <View style={{ gap: spacing.sm }}>
            {playerPoints.map((player, index) => (
              <AppCard key={player.memberId} style={styles.playerCard}>
                <View style={styles.playerRow}>
                  {/* List number */}
                  <View
                    style={[
                      styles.rankBadge,
                      { backgroundColor: colors.backgroundTertiary },
                    ]}
                  >
                    <AppText variant="captionBold" color="secondary">
                      {index + 1}
                    </AppText>
                  </View>

                  {/* Player name + score info */}
                  <View style={{ flex: 1 }}>
                    <AppText variant="body">
                      {player.memberName}
                    </AppText>
                    {(player.stablefordScore != null || player.netScore != null) && (
                      <AppText variant="small" color="tertiary">
                        {player.stablefordScore != null && `${player.stablefordScore} stb`}
                        {player.stablefordScore != null && player.netScore != null && " | "}
                        {player.netScore != null && `Net ${player.netScore}`}
                      </AppText>
                    )}
                  </View>

                  {/* Finish position input */}
                  <View style={styles.positionInput}>
                    <AppInput
                      placeholder="#"
                      value={player.finishPosition}
                      onChangeText={(v) => updateFinishPosition(player.memberId, v)}
                      keyboardType="number-pad"
                      style={{ textAlign: "center", minWidth: 45 }}
                    />
                  </View>

                  {/* Points input */}
                  <View style={styles.pointsInput}>
                    <AppInput
                      placeholder="0"
                      value={player.points}
                      onChangeText={(v) => updatePoints(player.memberId, v)}
                      keyboardType="number-pad"
                      style={{ textAlign: "center", minWidth: 55 }}
                    />
                    <AppText variant="small" color="tertiary">
                      pts
                    </AppText>
                  </View>
                </View>
              </AppCard>
            ))}
          </View>

          {/* Info card */}
          <AppCard style={styles.infoCard}>
            <View style={styles.infoContent}>
              <Feather name="info" size={16} color={colors.textTertiary} />
              <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
                Enter finish positions (1, 2, 3...) and tap "From Positions" to auto-assign F1 points, or enter points directly. Only top 10 positions earn points.
              </AppText>
            </View>
          </AppCard>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  f1Card: {
    marginBottom: spacing.md,
  },
  f1ButtonRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  columnHeaders: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  playerCard: {
    marginBottom: 0,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  positionInput: {
    flexDirection: "row",
    alignItems: "center",
  },
  pointsInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  infoCard: {
    marginTop: spacing.lg,
  },
  infoContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
});
