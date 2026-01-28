/**
 * Event Players Screen
 * - Select players for the event
 * - Uses Supabase instead of Firebase
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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

  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permissions = getPermissionsForMember(member as any);

  // Debug logging
  if (__DEV__) {
    console.log("[EventPlayers] eventId:", eventId);
    console.log("[EventPlayers] societyId:", societyId);
  }

  useEffect(() => {
    if (!eventId || !societyId) {
      setLoading(false);
      if (!eventId) setError("Missing event ID");
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load event and members in parallel
        const [eventData, membersData] = await Promise.all([
          getEvent(eventId),
          getMembersBySocietyId(societyId),
        ]);

        if (!eventData) {
          setError("Event not found");
          return;
        }

        console.log("[EventPlayers] Event loaded:", eventData.name);
        console.log("[EventPlayers] Members loaded:", membersData.length);

        setEvent(eventData);
        setMembers(membersData);
        setSelectedPlayerIds(new Set(eventData.playerIds || []));
      } catch (err: any) {
        console.error("[EventPlayers] Load error:", err);
        setError(err?.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [eventId, societyId]);

  const togglePlayer = (memberId: string) => {
    setSelectedPlayerIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (!event) return;

    setSaving(true);
    try {
      // Note: updateEvent in Supabase repo doesn't support playerIds yet
      // For now we'll use a direct Supabase call
      const { supabase } = await import("@/lib/supabase");

      const { error: updateError } = await supabase
        .from("events")
        .update({
          player_ids: Array.from(selectedPlayerIds),
          updated_at: new Date().toISOString(),
        })
        .eq("id", event.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      Alert.alert("Success", "Players saved successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.error("[EventPlayers] Save error:", err);
      Alert.alert("Error", err?.message || "Failed to save players");
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading players..." />
        </View>
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
          action={{
            label: "Go Back",
            onPress: () => router.back(),
          }}
        />
      </Screen>
    );
  }

  // Permission check
  if (!permissions.canCreateEvents) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => router.back()} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} />
            {" Back"}
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="lock" size={24} color={colors.warning} />}
          title="Access Denied"
          message="Only Captains and Admins can manage event players."
          action={{
            label: "Go Back",
            onPress: () => router.back(),
          }}
        />
      </Screen>
    );
  }

  // Event not found
  if (!event) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => router.back()} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} />
            {" Back"}
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="calendar" size={24} color={colors.textTertiary} />}
          title="Event Not Found"
          message="This event may have been deleted."
          action={{
            label: "Go Back",
            onPress: () => router.back(),
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
      </View>

      {/* Title */}
      <View style={styles.titleSection}>
        <AppText variant="title">Select Players</AppText>
        <AppText variant="caption" color="secondary">
          {event.name}
        </AppText>
      </View>

      {/* Selection count */}
      <AppCard style={styles.countCard}>
        <View style={styles.countRow}>
          <Feather name="users" size={20} color={colors.primary} />
          <AppText variant="bodyBold" style={{ marginLeft: spacing.sm }}>
            {selectedPlayerIds.size} of {members.length} selected
          </AppText>
        </View>
      </AppCard>

      {/* Members list */}
      {members.length === 0 ? (
        <EmptyState
          icon={<Feather name="users" size={24} color={colors.textTertiary} />}
          title="No Members"
          message="Add members to your society first, then select them for events."
        />
      ) : (
        <ScrollView style={styles.membersList} showsVerticalScrollIndicator={false}>
          {members.map((m) => {
            const isSelected = selectedPlayerIds.has(m.id);
            const displayName = m.name || m.displayName || "Member";

            return (
              <Pressable
                key={m.id}
                onPress={() => togglePlayer(m.id)}
                style={({ pressed }) => [
                  styles.memberCard,
                  isSelected && styles.memberCardSelected,
                  pressed && styles.memberCardPressed,
                ]}
              >
                <View style={styles.memberInfo}>
                  <AppText variant="bodyBold">{displayName}</AppText>
                  {m.handicap_index !== undefined && m.handicap_index !== null && (
                    <AppText variant="caption" color="secondary">
                      Handicap: {m.handicap_index}
                    </AppText>
                  )}
                </View>
                <View
                  style={[
                    styles.checkbox,
                    isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  {isSelected && <Feather name="check" size={14} color="#fff" />}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Save button */}
      {members.length > 0 && (
        <View style={styles.footer}>
          <PrimaryButton onPress={handleSave} loading={saving} style={styles.saveButton}>
            Save Players
          </PrimaryButton>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  titleSection: {
    marginBottom: spacing.lg,
  },
  countCard: {
    marginBottom: spacing.lg,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  membersList: {
    flex: 1,
    marginBottom: spacing.lg,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.base,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: "#f9fafb",
    borderWidth: 2,
    borderColor: "transparent",
  },
  memberCardSelected: {
    backgroundColor: "#f0fdf4",
    borderColor: "#0B6E4F",
  },
  memberCardPressed: {
    opacity: 0.8,
  },
  memberInfo: {
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  saveButton: {
    width: "100%",
  },
});
