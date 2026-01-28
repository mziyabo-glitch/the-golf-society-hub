/**
 * Event Players Screen
 * - Select players for the event
 * - Uses Supabase instead of Firebase
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
        const [evt, mems] = await Promise.all([
          getEvent(eventId),
          getMembersBySocietyId(societyId),
        ]);

        if (cancelled) return;

        setEvent(evt);
        setMembers(mems);

        const existing =
          (evt as any)?.player_ids ??
          (evt as any)?.playerIds ??
          [];

        setSelectedPlayerIds(new Set(existing.map(String)));
      } catch (e: any) {
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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

 async function save() {
  try {
    setSaving(true);

    const ids = Array.from(selectedPlayerIds);
    console.log("[players] saving", { eventId: event?.id, ids });

    await updateEvent(event!.id, { player_ids: ids } as any);

    console.log("[players] save OK");
    Alert.alert("Saved", "Players saved");
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
        <LoadingState label="Loading players..." />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <EmptyState
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
          title="Not found"
          message="Event not found."
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

        <PrimaryButton
          onPress={save}
          disabled={saving || !permissions?.canEditEvents}
          size="sm"
        >
          {saving ? "Saving..." : "Save"}
        </PrimaryButton>
      </View>

      <AppText variant="h2" style={{ marginBottom: spacing.lg }}>
        Players
      </AppText>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {members.length === 0 ? (
          <EmptyState
            title="No members"
            message="Add members first, then you can select players."
            action={{ label: "Go Back", onPress: () => router.back() }}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {members.map((m) => {
              const id = String(m.id);
              const selected = selectedPlayerIds.has(id);

              return (
                <Pressable key={id} onPress={() => togglePlayer(id)}>
                  <AppCard style={[styles.row, selected && styles.rowSelected]}>
                    <View style={{ flex: 1 }}>
                      <AppText style={styles.name}>
                        {(m as any).name ??
                          (m as any).full_name ??
                          "Member"}
                      </AppText>

                      {!!(m as any).whs_id && (
                        <AppText style={styles.subtle}>
                          WHS: {(m as any).whs_id}
                        </AppText>
                      )}
                    </View>

                    <Feather
                      name={selected ? "check-circle" : "circle"}
                      size={22}
                      color={selected ? colors.primary : colors.muted}
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
    marginBottom: spacing.lg,
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
  },
});

