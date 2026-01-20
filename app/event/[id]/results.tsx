/**
 * Event Results (Position-based)
 *
 * Per your spec: you don't want to enter raw scores.
 * You only want to enter finishing results and publish them.
 *
 * Implementation detail:
 * - We store the finishing position into `event.results[memberId].grossScore`.
 *   (The rest of the app already sorts "winner" by lowest grossScore.)
 */

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, TextInput, View } from "react-native";

import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { subscribeEventDoc, updateEventDoc, type EventDoc } from "@/lib/db/eventRepo";
import { subscribeMembersBySociety, type MemberDoc } from "@/lib/db/memberRepo";
import { canEnterScores, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getColors, spacing } from "@/lib/ui/theme";
import { useBootstrap } from "@/lib/useBootstrap";

type EventData = EventDoc;
type MemberData = MemberDoc;

export default function EventResultsScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const { user } = useBootstrap();

  const [event, setEvent] = useState<EventData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [positions, setPositions] = useState<Record<string, string>>({});
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [saving, setSaving] = useState(false);

  const colors = getColors();

  useEffect(() => {
    if (!eventId) return;
    setLoadingEvent(true);
    const unsub = subscribeEventDoc(eventId, (doc) => {
      setEvent(doc);
      // Hydrate existing saved results into the form.
      if (doc?.results) {
        const next: Record<string, string> = {};
        for (const [memberId, r] of Object.entries(doc.results)) {
          if (typeof r.grossScore === "number") next[memberId] = String(r.grossScore);
        }
        setPositions(next);
      }
      setLoadingEvent(false);
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }
    setLoadingMembers(true);
    const unsub = subscribeMembersBySociety(user.activeSocietyId, (items) => {
      setMembers(items);
      setLoadingMembers(false);
    });
    return () => unsub();
  }, [user?.activeSocietyId]);

  const currentMember = useMemo(
    () => members.find((m) => m.id === user?.activeMemberId) || null,
    [members, user?.activeMemberId]
  );

  const selectedPlayers = useMemo(() => {
    if (!event) return [] as MemberData[];
    const ids = event.playerIds?.length ? event.playerIds : members.map((m) => m.id);
    return members.filter((m) => ids.includes(m.id));
  }, [event, members]);

  useEffect(() => {
    // Permission gate: Captain / Secretary / Handicapper (existing app rule).
    const sessionRole = normalizeSessionRole("member");
    const roles = normalizeMemberRoles(currentMember?.roles);
    const canEnter = canEnterScores(sessionRole, roles);
    if (!canEnter && !loadingMembers && members.length > 0) {
      Alert.alert("Access Denied", "Only Captain, Secretary, or Handicapper can enter results", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  }, [currentMember?.roles, loadingMembers, members.length]);

  const handleChange = (memberId: string, value: string) => {
    // Allow only digits in the input.
    const cleaned = value.replace(/[^0-9]/g, "");
    setPositions((prev) => ({ ...prev, [memberId]: cleaned }));
  };

  const parsePosition = (value: string): number | null => {
    if (!value) return null;
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n <= 0) return null;
    return n;
  };

  const buildResultsPayload = (): EventData["results"] => {
    const payload: NonNullable<EventData["results"]> = {};
    for (const player of selectedPlayers) {
      const p = parsePosition(positions[player.id] ?? "");
      if (p !== null) {
        payload[player.id] = { grossScore: p };
      }
    }
    return payload;
  };

  const computeWinner = (payload: EventData["results"]): { id: string; name: string } | null => {
    if (!payload) return null;
    let best: { id: string; score: number } | null = null;
    for (const [memberId, r] of Object.entries(payload)) {
      const score = r?.grossScore;
      if (typeof score !== "number") continue;
      if (!best || score < best.score) best = { id: memberId, score };
    }
    if (!best) return null;
    const member = members.find((m) => m.id === best!.id);
    return { id: best.id, name: member?.name || "Winner" };
  };

  const validateBeforeSave = (): { ok: true } | { ok: false; message: string } => {
    if (!event) return { ok: false, message: "Event not found" };
    if (selectedPlayers.length === 0) return { ok: false, message: "No players selected" };

    const filled = selectedPlayers
      .map((p) => ({ id: p.id, pos: parsePosition(positions[p.id] ?? "") }))
      .filter((x) => x.pos !== null) as Array<{ id: string; pos: number }>;

    if (filled.length === 0) return { ok: false, message: "Enter at least one finishing position" };

    // Detect duplicates (not a hard error, but usually a mistake).
    const seen = new Map<number, number>();
    for (const f of filled) {
      seen.set(f.pos, (seen.get(f.pos) ?? 0) + 1);
    }
    const dupes = Array.from(seen.entries()).filter(([, c]) => c > 1).map(([p]) => p);
    if (dupes.length) {
      return {
        ok: false,
        message: `Duplicate positions found: ${dupes.join(", ")}. Each player should have a unique finishing position.`,
      };
    }

    return { ok: true };
  };

  const saveDraft = async () => {
    if (!event) return;
    const v = validateBeforeSave();
    if (!v.ok) {
      Alert.alert("Check results", v.message);
      return;
    }

    const resultsPayload = buildResultsPayload();
    const winner = computeWinner(resultsPayload);

    try {
      setSaving(true);
      await updateEventDoc(event.id, {
        results: resultsPayload,
        winnerId: winner?.id,
        winnerName: winner?.name,
        resultsStatus: "draft",
        resultsUpdatedAt: new Date().toISOString(),
      });
      Alert.alert("Saved", "Draft results saved.");
    } catch (e) {
      console.error("Error saving results draft", e);
      Alert.alert("Error", "Failed to save results");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!event) return;
    const v = validateBeforeSave();
    if (!v.ok) {
      Alert.alert("Check results", v.message);
      return;
    }

    const resultsPayload = buildResultsPayload();
    const winner = computeWinner(resultsPayload);

    try {
      setSaving(true);
      await updateEventDoc(event.id, {
        results: resultsPayload,
        winnerId: winner?.id,
        winnerName: winner?.name,
        resultsStatus: "published",
        publishedAt: new Date().toISOString(),
        isCompleted: true,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      Alert.alert("Published", "Results published.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e) {
      console.error("Error publishing results", e);
      Alert.alert("Error", "Failed to publish results");
    } finally {
      setSaving(false);
    }
  };

  if (loadingEvent || loadingMembers) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState title="Event not found" description="This event may have been deleted." />
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionHeader title="Enter Results" subtitle={event.name} />

      {selectedPlayers.length === 0 ? (
        <EmptyState title="No players" description="Add players to the event first." />
      ) : (
        <AppCard style={styles.card}>
          <AppText style={styles.helperText}>
            Enter finishing position for each player (1 = winner). No raw scores required.
          </AppText>

          {selectedPlayers.map((p) => (
            <View key={p.id} style={styles.row}>
              <AppText style={styles.name}>{p.name}</AppText>
              <TextInput
                value={positions[p.id] ?? ""}
                onChangeText={(v) => handleChange(p.id, v)}
                placeholder="#"
                keyboardType="number-pad"
                style={[styles.input, { borderColor: colors.border }]}
              />
            </View>
          ))}
        </AppCard>
      )}

      <View style={{ height: spacing.lg }} />

      <PrimaryButton title={saving ? "Saving..." : "Save Draft"} onPress={saveDraft} disabled={saving} />
      <View style={{ height: spacing.sm }} />
      <PrimaryButton title={saving ? "Publishing..." : "Publish Results"} onPress={publish} disabled={saving} />
      <View style={{ height: spacing.sm }} />
      <SecondaryButton title="Back" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
  },
  helperText: {
    opacity: 0.8,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  name: {
    flex: 1,
    marginRight: spacing.md,
  },
  input: {
    width: 80,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: "center",
    fontSize: 16,
  },
});
