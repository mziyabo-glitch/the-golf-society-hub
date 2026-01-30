/**
 * Event Points Entry Screen
 * - Enter Order of Merit points for players in an event
 * - Captain/Handicapper only
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

type PlayerPoints = {
  memberId: string;
  memberName: string;
  points: string; // String for input handling
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

      const points: PlayerPoints[] = playerIds.map((pid) => {
        const member = memberMap.get(pid);
        const existing = resultMap.get(pid);
        return {
          memberId: pid,
          memberName: member?.displayName || member?.name || "Unknown",
          points: existing?.points != null ? String(existing.points) : "",
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
      prev.map((p) => (p.memberId === memberId ? { ...p, points: value } : p))
    );
  };

  const handleSave = async () => {
    if (!event || !societyId) return;

    // Validate all points are valid numbers
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
          <View style={{ gap: spacing.sm }}>
            {playerPoints.map((player, index) => (
              <AppCard key={player.memberId} style={styles.playerCard}>
                <View style={styles.playerRow}>
                  {/* Rank number */}
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

                  {/* Player name */}
                  <AppText variant="body" style={{ flex: 1 }}>
                    {player.memberName}
                  </AppText>

                  {/* Points input */}
                  <View style={styles.pointsInput}>
                    <AppInput
                      placeholder="0"
                      value={player.points}
                      onChangeText={(v) => updatePoints(player.memberId, v)}
                      keyboardType="number-pad"
                      style={{ textAlign: "center", minWidth: 60 }}
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
                Enter points for each player. Leave blank for players with no points. Points are used for the Order of Merit leaderboard.
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
