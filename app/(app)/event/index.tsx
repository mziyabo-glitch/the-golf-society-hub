import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  getEventsBySocietyId,
  createEvent,
  type EventDoc,
} from "@/lib/db_supabase/eventRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type ModalMode = "none" | "create";

export default function EventIndexScreen() {
  const { societyId, member: currentMember, user, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>("none");

  // Form state
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formIsOOM, setFormIsOOM] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Get permissions for current member
  const permissions = getPermissionsForMember(currentMember as any);

  const loadEvents = async () => {
    if (!societyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getEventsBySocietyId(societyId);
      setEvents(data);
    } catch (err) {
      console.error("Failed to load events:", err);
      Alert.alert("Error", "Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [societyId]);

  const openCreateModal = () => {
    setFormName("");
    setFormDate("");
    setFormIsOOM(false);
    setModalMode("create");
  };

  const closeModal = () => {
    setModalMode("none");
    setFormName("");
    setFormDate("");
    setFormIsOOM(false);
  };

  const handleCreateEvent = async () => {
    if (!formName.trim()) {
      Alert.alert("Missing Name", "Please enter an event name.");
      return;
    }
    if (!formDate.trim()) {
      Alert.alert("Missing Date", "Please enter a date (YYYY-MM-DD).");
      return;
    }
    if (!societyId) {
      Alert.alert("Error", "No active society found.");
      return;
    }

    const uid = user?.uid;
    if (!uid) {
      Alert.alert("Error", "You must be signed in to create events.");
      return;
    }

    setSubmitting(true);
    try {
      await createEvent(societyId, {
        name: formName.trim(),
        date: formDate.trim(),
        createdBy: uid,
        isOOM: formIsOOM,
      });
      closeModal();
      loadEvents();
    } catch (e: any) {
      console.error("Create event error:", e);
      Alert.alert("Error", e?.message || "Failed to create event.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const getEventStatus = (event: EventDoc) => {
    if (event.isCompleted) return "Completed";
    if (event.status === "cancelled") return "Cancelled";
    return "Scheduled";
  };

  const getStatusColor = (event: EventDoc) => {
    if (event.isCompleted) return colors.success;
    if (event.status === "cancelled") return colors.error;
    return colors.primary;
  };

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading events..." />
        </View>
      </Screen>
    );
  }

  // Modal for create
  if (modalMode === "create") {
    return (
      <Screen>
        <View style={styles.modalHeader}>
          <SecondaryButton onPress={closeModal} size="sm">
            Cancel
          </SecondaryButton>
          <AppText variant="h2">Create Event</AppText>
          <View style={{ width: 60 }} />
        </View>

        <AppCard>
          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>Event Name</AppText>
            <AppInput
              placeholder="e.g. Summer Championship"
              value={formName}
              onChangeText={setFormName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>Date (YYYY-MM-DD)</AppText>
            <AppInput
              placeholder="e.g. 2025-06-15"
              value={formDate}
              onChangeText={setFormDate}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          <Pressable
            onPress={() => setFormIsOOM(!formIsOOM)}
            style={styles.checkboxRow}
          >
            <View style={[styles.checkbox, formIsOOM && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              {formIsOOM && <Feather name="check" size={14} color="#fff" />}
            </View>
            <AppText variant="body">Include in Order of Merit</AppText>
          </Pressable>

          <PrimaryButton
            onPress={handleCreateEvent}
            loading={submitting}
            style={{ marginTop: spacing.sm }}
          >
            Create Event
          </PrimaryButton>
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <AppText variant="title">Events</AppText>
          <AppText variant="caption" color="secondary">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </AppText>
        </View>
        {permissions.canCreateEvents && (
          <PrimaryButton onPress={openCreateModal} size="sm">
            Create Event
          </PrimaryButton>
        )}
      </View>

      {/* Events List */}
      {events.length === 0 ? (
        <EmptyState
          icon={<Feather name="calendar" size={24} color={colors.textTertiary} />}
          title="No Events Yet"
          message="Create your first event to get started."
          action={permissions.canCreateEvents ? { label: "Create Event", onPress: openCreateModal } : undefined}
        />
      ) : (
        <View style={styles.list}>
          {events.map((event) => {
            const status = getEventStatus(event);
            const statusColor = getStatusColor(event);

            return (
              <Pressable
                key={event.id}
                onPress={() => router.push(`/event/${event.id}`)}
              >
                <AppCard style={styles.eventCard}>
                  <View style={styles.eventRow}>
                    {/* Date badge */}
                    <View style={[styles.dateBadge, { backgroundColor: colors.backgroundTertiary }]}>
                      <AppText variant="small" color="secondary">
                        {event.date ? formatDateDisplay(event.date) : "TBD"}
                      </AppText>
                    </View>

                    {/* Info */}
                    <View style={styles.eventInfo}>
                      <AppText variant="bodyBold">{event.name}</AppText>
                      <View style={styles.metaRow}>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
                          <AppText variant="small" style={{ color: statusColor }}>
                            {status}
                          </AppText>
                        </View>
                        {event.isOOM && (
                          <View style={[styles.statusBadge, { backgroundColor: colors.warning + "20" }]}>
                            <AppText variant="small" style={{ color: colors.warning }}>
                              OOM
                            </AppText>
                          </View>
                        )}
                        {event.playerIds && event.playerIds.length > 0 && (
                          <AppText variant="caption" color="tertiary">
                            {event.playerIds.length} player{event.playerIds.length !== 1 ? "s" : ""}
                          </AppText>
                        )}
                      </View>
                    </View>

                    {/* Chevron */}
                    <Feather name="chevron-right" size={20} color={colors.textTertiary} />
                  </View>
                </AppCard>
              </Pressable>
            );
          })}
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
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  list: {
    gap: spacing.xs,
  },
  eventCard: {
    marginBottom: 0,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dateBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  eventInfo: {
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  formField: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
});
