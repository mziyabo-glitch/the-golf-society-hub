/**
 * Event Players Screen
 * - Select players for the event
 * - Uses Supabase instead of Firebase
 * Note: Tee sheet generation moved to ManCo Tools
 */

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
import { getEvent, updateEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";

export default function EventPlayersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { societyId, member, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const eventId = useMemo(() => {
    const raw = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permissions = getPermissionsForMember(member as any);

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
        console.log("[players] loading event + members", { eventId, societyId });

        const [evt, mems] = await Promise.all([
          getEvent(eventId),
          getMembersBySocietyId(societyId),
        ]);

        if (cancelled) return;

        console.log("[players] loaded event:", {
          id: evt?.id,
          playerIds: evt?.playerIds,
        });

        setEvent(evt);
        setMembers(mems);

        // Use playerIds (camelCase) as returned by mapEvent
        const existing = evt?.playerIds ?? [];
        console.log("[players] initializing selection from:", existing);
        setSelectedPlayerIds(new Set(existing.map(String)));
      } catch (e: any) {
        console.error("[players] load FAILED", e);
        if (!cancelled) {
          setError(e?.message ?? "Failed to load players");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [bootstrapLoading, societyId, eventId]);

  function togglePlayer(id: string) {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function save() {
    try {
      setSaving(true);

      const ids = Array.from(selectedPlayerIds);
      console.log("[players] saving", {
        eventId: event?.id,
        societyId,
        playerIds: ids,
      });

      await updateEvent(event!.id, { playerIds: ids });

      console.log("[players] save OK, refetching to confirm...");

      // Refetch to confirm persistence
      const refreshed = await getEvent(event!.id);
      if (refreshed) {
        const reloaded = refreshed.playerIds ?? [];
        console.log("[players] confirmed playerIds:", reloaded);
      }

      // Navigate back - Event Detail will refetch via useFocusEffect
      router.back();
    } catch (e: any) {
      console.error("[players] save FAILED", e);
      Alert.alert("Save failed", e?.message ?? JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState message="Loading players..." />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <EmptyState
          title="Error"
          message={error}
          action={{ label: "Go Back", onPress: () => router.replace({ pathname: "/event/[id]", params: { id: eventId, refresh: Date.now().toString() } }) }}
        />
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState
          title="Not found"
          message="Event not found."
          action={{ label: "Go Back", onPress: () => router.replace({ pathname: "/event/[id]", params: { id: eventId, refresh: Date.now().toString() } }) }}
        />
      </Screen>
    );
  }

  const selectedCount = selectedPlayerIds.size;

  return (
    <Screen>
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} />
          {" Back"}
        </SecondaryButton>

        <View style={{ flex: 1 }} />

        <PrimaryButton
          onPress={save}
          disabled={saving || !permissions?.canEditEvents}
          size="sm"
        >
          {saving ? "Saving..." : "Save"}
        </PrimaryButton>
      </View>

      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="h2">Players</AppText>
          <AppText variant="caption" color="secondary">
            {selectedCount} selected
          </AppText>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {members.length === 0 ? (
          <EmptyState
            title="No members"
            message="Add members first, then you can select players."
            action={{ label: "Go Back", onPress: () => router.replace({ pathname: "/event/[id]", params: { id: eventId, refresh: Date.now().toString() } }) }}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {members.map((m) => {
              const id = String(m.id);
              const selected = selectedPlayerIds.has(id);
              const handicap = m.handicapIndex ?? (m as any).handicap_index;

              return (
                <Pressable key={id} onPress={() => togglePlayer(id)}>
                  <AppCard style={selected ? { ...styles.row, ...styles.rowSelected } : styles.row}>
                    <View style={{ flex: 1 }}>
                      <AppText style={styles.name}>
                        {m.name || m.displayName || "Member"}
                      </AppText>

                      {handicap != null && (
                        <AppText style={styles.subtle}>
                          HCP: {handicap}
                        </AppText>
                      )}
                    </View>

                    <Feather
                      name={selected ? "check-circle" : "circle"}
                      size={22}
                      color={selected ? colors.primary : colors.textTertiary}
                    />
                  </AppCard>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
  },
  rowSelected: {
    borderWidth: 1,
    borderColor: "#0A7C4A",
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
  },
  subtle: {
    marginTop: 4,
    opacity: 0.7,
    fontSize: 13,
  },
});
