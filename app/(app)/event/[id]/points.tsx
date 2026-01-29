import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";

import { useBootstrap } from "@/lib/useBootstrap";
import { getEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { getEventResults, upsertEventResults } from "@/lib/db_supabase/resultsRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";

export default function EventPointsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { societyId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const eventId = useMemo(() => {
    const raw = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [pointsByMember, setPointsByMember] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registeredIds = useMemo(() => {
    const ids =
      (event as any)?.player_ids ??
      (event as any)?.playerIds ??
      [];
    return new Set((ids ?? []).map((x: any) => String(x)));
  }, [event]);

  const registeredMembers = useMemo(() => {
    return members.filter((m) => registeredIds.has(String((m as any).id)));
  }, [members, registeredIds]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
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
        const [evt, mems, results] = await Promise.all([
          getEvent(eventId),
          getMembersBySocietyId(societyId),
          getEventResults(eventId),
        ]);

        if (cancelled) return;

        setEvent(evt);
        setMembers(mems);

        const next: Record<string, number> = {};
        for (const r of results) {
          next[String(r.member_id)] = Number(r.points ?? 0);
        }
        setPointsByMember(next);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load points");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [bootstrapLoading, societyId, eventId]);

  function adjust(memberId: string, delta: number) {
    setPointsByMember((prev) => {
      const cur = Number(prev[memberId] ?? 0);
      return { ...prev, [memberId]: cur + delta };
    });
  }

  async function save() {
    if (!eventId) return;

    try {
      setSaving(true);

      const rows = registeredMembers.map((m) => {
        const id = String((m as any).id);
        return { member_id: id, points: Number(pointsByMember[id] ?? 0) };
      });

      await upsertEventResults(eventId, rows);

      Alert.alert("Saved", "Points saved successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save points");
    } finally {
      setSaving(false);
    }
  }

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState label="Loading points..." />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <EmptyState title="Error" message={error} action={{ label: "Go Back", onPress: () => router.back() }} />
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState title="Not found" message="Event not found." action={{ label: "Go Back", onPress: () => router.back() }} />
      </Screen>
    );
  }

  if (registeredMembers.length === 0) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => router.back()} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} />
            {" Back"}
          </SecondaryButton>
        </View>

        <EmptyState
          title="No players"
          message="Add players to this event first, then you can enter points."
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

        <PrimaryButton onPress={save} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save"}
        </PrimaryButton>
      </View>

      <AppText variant="h2" style={{ marginBottom: spacing.lg }}>
        Points
      </AppText>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={{ gap: spacing.md }}>
          {registeredMembers.map((m) => {
            const id = String((m as any).id);
            const name = (m as any).name ?? (m as any).full_name ?? "Member";
            const pts = Number(pointsByMember[id] ?? 0);

            return (
              <AppCard key={id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.name}>{name}</AppText>
                  <AppText style={styles.subtle}>Points: {pts}</AppText>
                </View>

                <View style={styles.controls}>
                  <Pressable onPress={() => adjust(id, -1)} style={styles.iconBtn}>
                    <Feather name="minus" size={18} color={colors.text} />
                  </Pressable>

                  <View style={styles.pointsPill}>
                    <AppText style={styles.pointsText}>{String(pts)}</AppText>
                  </View>

                  <Pressable onPress={() => adjust(id, 1)} style={styles.iconBtn}>
                    <Feather name="plus" size={18} color={colors.text} />
                  </Pressable>
                </View>
              </AppCard>
            );
          })}
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
  row: {
    padding: spacing.md,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
  },
  name: { fontSize: 16, fontWeight: "600" },
  subtle: { marginTop: 4, opacity: 0.7 },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  pointsPill: {
    minWidth: 44,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDD",
  },
  pointsText: { fontSize: 16, fontWeight: "700" },
});
