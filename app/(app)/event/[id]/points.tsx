/**
 * Event Points Entry Screen
 *
 * Workflow:
 * 1. User enters Day Points (stableford score or strokeplay score) for each player
 * 2. App auto-sorts based on event format:
 *    - Stableford (high_wins): Higher points = better position
 *    - Strokeplay (low_wins): Lower score = better position
 * 3. App auto-assigns positions (1, 2, 3...) with tie handling
 * 4. App auto-calculates OOM points using F1 top-10: [25,18,15,12,10,8,6,4,2,1]
 * 5. Save stores ONLY the OOM points to event_results
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
import { getEvent, getFormatSortOrder, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import {
  upsertEventResults,
  getEventResults,
  type EventResultDoc,
} from "@/lib/db_supabase/resultsRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";

// F1-style OOM points: positions 1-10 get points, rest get 0
const F1_OOM_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

function getOOMPoints(position: number): number {
  if (position >= 1 && position <= 10) {
    return F1_OOM_POINTS[position - 1];
  }
  return 0;
}

type PlayerEntry = {
  memberId: string;
  memberName: string;
  dayPoints: string; // User input - the competition/stableford score
  position: number | null; // Auto-calculated
  oomPoints: number; // Auto-calculated F1 points
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
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permissions = getPermissionsForMember(currentMember as any);
  const canEnterPoints = permissions.canManageHandicaps;

  // Load event data and existing results
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
      const [evt, members, existingResults] = await Promise.all([
        getEvent(eventId),
        getMembersBySocietyId(societyId),
        getEventResults(eventId),
      ]);

      if (!evt) {
        setError("Event not found");
        setLoading(false);
        return;
      }

      setEvent(evt);

      // Build player list from event's playerIds
      const playerIds = evt.playerIds ?? [];
      const memberMap = new Map(members.map((m) => [m.id, m]));
      const resultMap = new Map(existingResults.map((r) => [r.member_id, r]));

      // Initialize players with empty day points
      // If existing OOM points exist, we can't reverse-engineer day points, so leave blank
      const playerList: PlayerEntry[] = playerIds.map((pid) => {
        const member = memberMap.get(pid);
        return {
          memberId: pid,
          memberName: member?.displayName || member?.name || "Unknown",
          dayPoints: "",
          position: null,
          oomPoints: 0,
        };
      });

      setPlayers(playerList);
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

  // Update day points for a player and recalculate positions/OOM
  const updateDayPoints = (memberId: string, value: string) => {
    setPlayers((prev) => {
      // Update the day points value
      const updated = prev.map((p) =>
        p.memberId === memberId ? { ...p, dayPoints: value } : p
      );

      // Recalculate positions and OOM points
      return calculatePositionsAndOOM(updated);
    });
  };

  // Get sort order based on event format
  const sortOrder = getFormatSortOrder(event?.format);

  // Calculate positions and OOM points based on day points
  const calculatePositionsAndOOM = (playerList: PlayerEntry[]): PlayerEntry[] => {
    // Separate players with valid day points from those without
    const withPoints: PlayerEntry[] = [];
    const withoutPoints: PlayerEntry[] = [];

    for (const p of playerList) {
      const dayPts = parseInt(p.dayPoints.trim(), 10);
      if (!isNaN(dayPts) && p.dayPoints.trim() !== "") {
        withPoints.push({ ...p, position: null, oomPoints: 0 });
      } else {
        withoutPoints.push({ ...p, position: null, oomPoints: 0 });
      }
    }

    // Sort based on format:
    // - Stableford (high_wins): Higher points = better position (DESC)
    // - Strokeplay (low_wins): Lower score = better position (ASC)
    withPoints.sort((a, b) => {
      const aPts = parseInt(a.dayPoints.trim(), 10);
      const bPts = parseInt(b.dayPoints.trim(), 10);

      if (aPts !== bPts) {
        if (sortOrder === 'low_wins') {
          return aPts - bPts; // Lower is better for strokeplay
        }
        return bPts - aPts; // Higher is better for stableford
      }
      return a.memberName.localeCompare(b.memberName); // Alphabetical tie-break
    });

    // Assign positions and OOM points
    // Handle ties: same day points = same position
    let currentPosition = 1;
    const positioned = withPoints.map((p, index) => {
      if (index > 0) {
        const prevPts = parseInt(withPoints[index - 1].dayPoints.trim(), 10);
        const currPts = parseInt(p.dayPoints.trim(), 10);
        if (currPts !== prevPts) {
          currentPosition = index + 1;
        }
        // If equal, keep same position (tie)
      }
      return {
        ...p,
        position: currentPosition,
        oomPoints: getOOMPoints(currentPosition),
      };
    });

    // Combine: players with points (sorted) + players without points (original order)
    return [...positioned, ...withoutPoints];
  };

  // Calculate players with valid day points (used for canSave and save)
  const playersWithDayPoints = useMemo(() => {
    return players.filter(
      (p) => p.dayPoints.trim() !== "" && !isNaN(parseInt(p.dayPoints.trim(), 10))
    );
  }, [players]);

  // Compute canSave with clear reasons
  const saveReadiness = useMemo(() => {
    if (!eventId) return { canSave: false, reason: "Missing event ID" };
    if (!societyId) return { canSave: false, reason: "Missing society ID" };
    if (!event) return { canSave: false, reason: "Event not loaded" };
    if (players.length === 0) return { canSave: false, reason: "No players in event" };
    if (playersWithDayPoints.length === 0) return { canSave: false, reason: "Enter day points for at least one player" };
    if (saving) return { canSave: false, reason: "Save in progress..." };
    return { canSave: true, reason: null };
  }, [eventId, societyId, event, players.length, playersWithDayPoints.length, saving]);

  // Save OOM points to database - wrapped in useCallback with all dependencies
  const handleSave = useCallback(async () => {
    // Log what we're working with
    console.log("[points] Save pressed", {
      eventId,
      societyId,
      eventLoaded: !!event,
      playerCount: players.length,
      playersWithDayPoints: playersWithDayPoints.length,
      saving,
    });

    // Gate checks with logging
    if (!eventId) {
      console.warn("[points] Save blocked: missing eventId");
      Alert.alert("Cannot Save", "Event ID is missing. Please go back and try again.");
      return;
    }

    if (!societyId) {
      console.warn("[points] Save blocked: missing societyId");
      Alert.alert("Cannot Save", "Society ID is missing. Please go back and try again.");
      return;
    }

    if (!event) {
      console.warn("[points] Save blocked: event not loaded");
      Alert.alert("Cannot Save", "Event data not loaded. Please wait or refresh.");
      return;
    }

    if (playersWithDayPoints.length === 0) {
      console.warn("[points] Save blocked: no day points entered");
      Alert.alert("No Points Entered", "Please enter day points for at least one player.");
      return;
    }

    if (saving) {
      console.warn("[points] Save blocked: already saving");
      return;
    }

    setSaving(true);
    try {
      // Build results array with OOM points for all players with day points
      // Use Array.from() to ensure we have a proper array (not a stale memoized value)
      const playersToSave = Array.from(playersWithDayPoints);

      console.log("[points] playersToSave:", {
        isArray: Array.isArray(playersToSave),
        length: playersToSave.length,
        players: playersToSave,
      });

      const results: Array<{ member_id: string; points: number }> = [];
      for (const p of playersToSave) {
        results.push({
          member_id: p.memberId,
          points: p.oomPoints,
        });
      }

      console.log("[points] results array:", {
        isArray: Array.isArray(results),
        length: results.length,
        results: JSON.stringify(results),
      });

      if (!Array.isArray(results) || results.length === 0) {
        throw new Error("Failed to build results array");
      }

      await upsertEventResults(event.id, societyId, results);

      console.log("[points] Save SUCCESS");

      Alert.alert("Saved", "OOM points saved successfully.", [
        {
          text: "OK",
          onPress: () => {
            // Use replace to ensure leaderboard refetches
            router.back();
          },
        },
      ]);
    } catch (e: any) {
      console.error("[points] Save FAILED", e);
      Alert.alert("Save Failed", e?.message ?? "Failed to save points. Check console for details.");
    } finally {
      setSaving(false);
    }
  }, [eventId, societyId, event, playersWithDayPoints, saving, router]);

  // Loading state
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
          message="Only Captain or Handicapper can enter points."
          action={{ label: "Go Back", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  // Error state
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

  // Event not found
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

  // Check if OOM event
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
          title="Not an OOM Event"
          message="Points can only be entered for Order of Merit events."
          action={{ label: "Go Back", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  // No players
  if (players.length === 0) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => router.back()} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} />
            {" Back"}
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="user-plus" size={24} color={colors.primary} />}
          title="Select Players First"
          message="Add players to this event before entering points."
          action={{
            label: "Select Players",
            onPress: () =>
              router.push({
                pathname: "/(app)/event/[id]/players",
                params: { id: eventId },
              }),
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} />
          {" Back"}
        </SecondaryButton>
        <View style={{ flex: 1 }} />
        <PrimaryButton
          onPress={handleSave}
          disabled={!saveReadiness.canSave}
          size="sm"
        >
          {saving ? "Saving..." : "Save"}
        </PrimaryButton>
      </View>

      {/* Title */}
      <AppText variant="h2" style={{ marginBottom: spacing.xs }}>
        {sortOrder === 'low_wins' ? "Enter Scores" : "Enter Points"}
      </AppText>
      <AppText variant="body" color="secondary" style={{ marginBottom: spacing.md }}>
        {event.name} ({event.format === 'stableford' ? 'Stableford' : event.format === 'strokeplay_net' ? 'Strokeplay Net' : event.format === 'strokeplay_gross' ? 'Strokeplay Gross' : event.format})
      </AppText>

      {/* Instructions - format-specific */}
      <AppCard style={styles.instructionCard}>
        <View style={styles.instructionContent}>
          <Feather name="info" size={16} color={colors.primary} />
          <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
            {sortOrder === 'low_wins'
              ? "Enter scores (lower is better). Positions and OOM points are calculated automatically. Top 10 earn F1 points: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1."
              : "Enter stableford points (higher is better). Positions and OOM points are calculated automatically. Top 10 earn F1 points: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1."}
          </AppText>
        </View>
      </AppCard>

      {/* Save status helper */}
      {!saveReadiness.canSave && saveReadiness.reason && (
        <View style={styles.saveHelper}>
          <Feather name="alert-circle" size={14} color={colors.warning} />
          <AppText variant="small" color="secondary">
            {saveReadiness.reason}
          </AppText>
        </View>
      )}
      {saveReadiness.canSave && playersWithDayPoints.length > 0 && (
        <View style={styles.saveHelper}>
          <Feather name="check-circle" size={14} color={colors.success} />
          <AppText variant="small" color="secondary">
            Ready to save {playersWithDayPoints.length} player{playersWithDayPoints.length !== 1 ? "s" : ""}
          </AppText>
        </View>
      )}

      {/* Column Headers */}
      <View style={styles.columnHeaders}>
        <AppText variant="captionBold" color="tertiary" style={{ flex: 1 }}>
          Player
        </AppText>
        <AppText variant="captionBold" color="tertiary" style={styles.colDayPoints}>
          {sortOrder === 'low_wins' ? "Score" : "Pts"}
        </AppText>
        <AppText variant="captionBold" color="tertiary" style={styles.colPos}>
          Pos
        </AppText>
        <AppText variant="captionBold" color="tertiary" style={styles.colOOM}>
          OOM
        </AppText>
      </View>

      {/* Player List */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={{ gap: spacing.xs }}>
          {players.map((player) => (
            <View
              key={player.memberId}
              style={[styles.playerRow, { backgroundColor: colors.backgroundSecondary }]}
            >
              {/* Player Name */}
              <AppText variant="body" style={{ flex: 1 }} numberOfLines={1}>
                {player.memberName}
              </AppText>

              {/* Day Points Input */}
              <View style={styles.colDayPoints}>
                <AppInput
                  placeholder="-"
                  value={player.dayPoints}
                  onChangeText={(v) => updateDayPoints(player.memberId, v)}
                  keyboardType="number-pad"
                  style={styles.inputBox}
                />
              </View>

              {/* Position (read-only) */}
              <View style={styles.colPos}>
                <AppText
                  variant="bodyBold"
                  color={player.position && player.position <= 3 ? "primary" : "secondary"}
                >
                  {player.position ?? "-"}
                </AppText>
              </View>

              {/* OOM Points (read-only) */}
              <View style={styles.colOOM}>
                <AppText
                  variant="bodyBold"
                  color={player.oomPoints > 0 ? "primary" : "tertiary"}
                >
                  {player.oomPoints}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
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
  instructionCard: {
    marginBottom: spacing.sm,
  },
  instructionContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  saveHelper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  columnHeaders: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  colDayPoints: {
    width: 70,
    alignItems: "center",
  },
  colPos: {
    width: 40,
    alignItems: "center",
  },
  colOOM: {
    width: 45,
    alignItems: "center",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  inputBox: {
    textAlign: "center",
    width: 60,
    paddingHorizontal: spacing.xs,
  },
});
