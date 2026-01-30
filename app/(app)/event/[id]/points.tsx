/**
 * Event Points Entry Screen
 *
 * Workflow (simple + real-world):
 * 1) Captain/Handicapper enters the day value from the scorecard/gamebook for each player:
 *    - Stableford: enter Stableford points (higher is better)
 *    - Medal: enter Net score (lower is better)
 * 2) App sorts by format rule, assigns finishing positions, then allocates
 *    F1-style Order of Merit points to the top 10: [25,18,15,12,10,8,6,4,2,1]
 * 3) Save stores ONLY the OOM points to event_results.
 * 4) After Save, navigate straight to Order of Merit and open Results Log.
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
import { getMembersBySocietyId } from "@/lib/db_supabase/memberRepo";
import { upsertEventResults, getEventResults } from "@/lib/db_supabase/resultsRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing } from "@/lib/ui/theme";

type PlayerEntry = {
  memberId: string;
  memberName: string;
  dayValue: string; // string for input handling
  position: number | null;
  oomPoints: number;
};

const F1_OOM_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

function getOOMPoints(position: number | null): number {
  if (!position) return 0;
  const idx = position - 1;
  return idx >= 0 && idx < F1_OOM_POINTS.length ? F1_OOM_POINTS[idx] : 0;
}

function parseIntOrNull(s: string): number | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function calculatePositionsAndOOM(
  list: PlayerEntry[],
  format: EventDoc["format"] | null | undefined
): PlayerEntry[] {
  const isMedal = format === "medal";

  const withValues: Array<{ p: PlayerEntry; v: number }> = [];
  const withoutValues: PlayerEntry[] = [];

  for (const p of list) {
    const v = parseIntOrNull(p.dayValue);
    if (v === null) {
      withoutValues.push({ ...p, position: null, oomPoints: 0 });
    } else {
      withValues.push({ p: { ...p, position: null, oomPoints: 0 }, v });
    }
  }

  // Sort:
  // - Stableford: higher is better (DESC)
  // - Medal: lower is better (ASC)
  // Tie-break: memberName ASC (deterministic MVP)
  withValues.sort((a, b) => {
    if (a.v !== b.v) return isMedal ? a.v - b.v : b.v - a.v;
    return a.p.memberName.localeCompare(b.p.memberName);
  });

  // Assign positions (ties share the same position)
  let currentPosition = 1;
  const positioned: PlayerEntry[] = withValues.map((item, index) => {
    if (index > 0) {
      const prev = withValues[index - 1].v;
      const curr = item.v;
      const isWorse = isMedal ? curr > prev : curr < prev;
      if (isWorse) currentPosition = index + 1;
    }
    return {
      ...item.p,
      position: currentPosition,
      oomPoints: getOOMPoints(currentPosition),
    };
  });

  return [...positioned, ...withoutValues];
}

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
  // Your app already uses this permission for Captain/Handicapper entry
  const canEnterPoints = permissions.canManageHandicaps;

  const eventFormat = event?.format ?? "stableford";
  const isMedalFormat = eventFormat === "medal";
  const dayValueLabel = isMedalFormat ? "Net Score (Medal)" : "Day Points (Stableford)";
  const dayValueHelper = isMedalFormat ? "Lower is better" : "Higher is better";
  const dayValueColumnLabel = isMedalFormat ? "Net" : "Day Pts";

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

      setEvent(evt);

      const playerIds = evt.playerIds ?? [];
      const memberMap = new Map(mems.map((m: any) => [m.id, m]));
      const resultMap = new Map(results.map((r: any) => [r.member_id, r]));

      const initial: PlayerEntry[] = playerIds.map((pid) => {
        const member = memberMap.get(pid);
        const existing = resultMap.get(pid);
        return {
          memberId: pid,
          memberName: member?.displayName || member?.name || "Unknown",
          dayValue: "",
          position: null,
          // show already saved OOM points if any
          oomPoints: existing?.points != null ? existing.points : 0,
        };
      });

      setPlayers(initial);
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

  const updateDayValue = (memberId: string, value: string) => {
    setPlayers((prev) => {
      const updated = prev.map((p) => (p.memberId === memberId ? { ...p, dayValue: value } : p));
      return calculatePositionsAndOOM(updated, eventFormat);
    });
  };

  const playersWithDayValues = useMemo(() => {
    return players.filter((p) => parseIntOrNull(p.dayValue) !== null);
  }, [players]);

  const canSave = useMemo(() => {
    return !!event && !!societyId && !saving && playersWithDayValues.length > 0;
  }, [event, societyId, saving, playersWithDayValues.length]);

  const handleSave = useCallback(async () => {
    // This MUST log every click. If you don’t see this, the button isn’t firing.
    console.log("[points] SAVE CLICKED", {
      eventId,
      societyId,
      format: event?.format,
      playerCount: players.length,
      playersWithDayValues: playersWithDayValues.length,
      saving,
    });

    if (!event || !societyId) {
      Alert.alert("Not ready", "Event or society not loaded yet.");
      return;
    }

    if (playersWithDayValues.length === 0) {
      Alert.alert("Nothing to save", `Enter ${dayValueLabel} for at least one player.`);
      return;
    }

    // Validate values
    for (const p of playersWithDayValues) {
      const n = parseIntOrNull(p.dayValue);
      if (n === null || n < 0) {
        Alert.alert(
          "Invalid Value",
          `${dayValueLabel} for ${p.memberName} must be a non-negative number.`
        );
        return;
      }
    }

    setSaving(true);
    try {
      // Persist ONLY OOM points (derived)
      const rows = playersWithDayValues.map((p) => ({
        member_id: p.memberId,
        points: p.oomPoints,
      }));

      console.log("[points] upserting event_results rows:", rows.length, rows);

      await upsertEventResults(event.id, societyId, rows);

      console.log("[points] save OK -> navigating to leaderboard log");

      // Go straight to Order of Merit leaderboard and show Results Log view
      router.replace("/(app)/(tabs)/leaderboard?view=log" as any);
    } catch (e: any) {
      console.error("[points] save FAILED", e);
      Alert.alert("Save Failed", e?.message ?? "Failed to save points");
    } finally {
      setSaving(false);
    }
  }, [
    event,
    societyId,
    eventId,
    players.length,
    playersWithDayValues,
    saving,
    dayValueLabel,
    router,
  ]);

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState label="Loading..." />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="alert-triangle" size={24} color={colors.error} />}
          title="Something went wrong"
          message={error}
        />
      </Screen>
    );
  }

  if (!canEnterPoints) {
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="lock" size={24} color={colors.error} />}
          title="No Access"
          message="Only the Captain or Handicapper can enter points."
        />
      </Screen>
    );
  }

  if (!event?.playerIds || event.playerIds.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="users" size={24} color={colors.textMuted} />}
          title="No players selected"
          message="Select players for this event before entering points."
          actionLabel="Select Players"
          onAction={() => router.push(`/event/${eventId}/players` as any)}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <AppText variant="h2" style={{ marginBottom: spacing.xs }}>
          Enter Day Values
        </AppText>
        <AppText variant="body" color="secondary" style={{ marginBottom: spacing.md }}>
          {event?.name}
        </AppText>

        <AppCard style={styles.instructionCard}>
          <View style={styles.instructionContent}>
            <Feather name="info" size={16} color={colors.primary} />
            <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
              Enter the day value from the scorecard/gamebook. Positions and OOM points are calculated automatically.
              Top 10 earn F1 points: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1.
            </AppText>
          </View>
        </AppCard>

        <View style={styles.dayValueHelper}>
          <AppText variant="captionBold" color="secondary">
            {dayValueLabel}
          </AppText>
          <AppText variant="small" color="secondary">
            {dayValueHelper}
          </AppText>
        </View>

        {/* In-screen Save button to avoid flaky header handlers */}
        <PrimaryButton onPress={handleSave} disabled={!canSave} loading={saving}>
          <Feather name="save" size={16} color={colors.onPrimary} />
          {" Save & View OOM"}
        </PrimaryButton>

        <View style={{ height: spacing.md }} />

        <View style={styles.columnHeaders}>
          <AppText variant="captionBold" color="tertiary" style={{ flex: 1 }}>
            Player
          </AppText>
          <AppText variant="captionBold" color="tertiary" style={styles.colDayValue}>
            {dayValueColumnLabel}
          </AppText>
          <AppText variant="captionBold" color="tertiary" style={styles.colPos}>
            Pos
          </AppText>
          <AppText variant="captionBold" color="tertiary" style={styles.colOOM}>
            OOM
          </AppText>
        </View>

        <View style={{ gap: spacing.sm }}>
          {players.map((p) => (
            <AppCard key={p.memberId} style={styles.rowCard}>
              <View style={styles.row}>
                <AppText variant="body" style={{ flex: 1 }}>
                  {p.memberName}
                </AppText>

                <View style={styles.colDayValue}>
                  <AppInput
                    value={p.dayValue}
                    onChangeText={(v) => updateDayValue(p.memberId, v)}
                    keyboardType="numeric"
                    placeholder="-"
                    style={styles.input}
                  />
                </View>

                <View style={styles.colPos}>
                  <AppText variant="body" style={styles.centerText}>
                    {p.position ?? "-"}
                  </AppText>
                </View>

                <View style={styles.colOOM}>
                  <AppText variant="body" style={styles.centerText}>
                    {p.oomPoints}
                  </AppText>
                </View>
              </View>
            </AppCard>
          ))}
        </View>

        <View style={{ height: spacing.xl }} />

        {/* Back button at bottom (optional) */}
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} />
          {" Back"}
        </SecondaryButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  instructionCard: {
    marginBottom: spacing.md,
  },
  instructionContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  dayValueHelper: {
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  columnHeaders: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  rowCard: {
    padding: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  colDayValue: {
    width: 78,
  },
  colPos: {
    width: 44,
  },
  colOOM: {
    width: 52,
  },
  input: {
    textAlign: "center",
    paddingVertical: spacing.xs,
  },
  centerText: {
    textAlign: "center",
  },
});
