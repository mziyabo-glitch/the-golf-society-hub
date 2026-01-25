import { useEffect, useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";

export default function EventsScreen() {
  const router = useRouter();
  const { societyId, member, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const permissions = getPermissionsForMember(member as any);

  useEffect(() => {
    if (!societyId) {
      setLoading(false);
      return;
    }

    const unsub = subscribeEventsBySociety(
      societyId,
      (docs) => {
        setEvents(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Events subscription error:", err);
        setLoading(false);
      }
    );

    return unsub;
  }, [societyId]);

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading events..." />
        </View>
      </Screen>
    );
  }

  const upcomingEvents = events.filter((e) => !e.isCompleted);
  const completedEvents = events.filter((e) => e.isCompleted);

  const getStatusColor = (event: EventDoc) => {
    if (event.isCompleted) return colors.success;
    if (event.status === "cancelled") return colors.error;
    return colors.primary;
  };

  const getStatusLabel = (event: EventDoc) => {
    if (event.isCompleted) return "Completed";
    if (event.status === "cancelled") return "Cancelled";
    if (event.status === "in_progress") return "In Progress";
    return "Scheduled";
  };

  const renderEventCard = (event: EventDoc) => (
    <Pressable
      key={event.id}
      onPress={() => router.push(`/(app)/event/${event.id}`)}
    >
      <AppCard style={styles.eventCard}>
        <View style={styles.eventRow}>
          {/* Date badge */}
          <View style={[styles.dateBadge, { backgroundColor: colors.backgroundTertiary }]}>
            {event.date ? (
              <>
                <AppText variant="captionBold" color="primary">
                  {new Date(event.date).toLocaleDateString("en-GB", { day: "numeric" })}
                </AppText>
                <AppText variant="small" color="secondary">
                  {new Date(event.date).toLocaleDateString("en-GB", { month: "short" })}
                </AppText>
              </>
            ) : (
              <AppText variant="caption" color="tertiary">TBD</AppText>
            )}
          </View>

          {/* Event info */}
          <View style={styles.eventInfo}>
            <AppText variant="bodyBold" numberOfLines={1}>{event.name}</AppText>
            {event.courseName && (
              <AppText variant="caption" color="secondary" numberOfLines={1}>
                {event.courseName}
              </AppText>
            )}
            <View style={styles.eventMeta}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(event) + "20" }]}>
                <AppText variant="small" style={{ color: getStatusColor(event) }}>
                  {getStatusLabel(event)}
                </AppText>
              </View>
              {event.format && (
                <AppText variant="small" color="tertiary">{event.format}</AppText>
              )}
              {event.isOOM && (
                <View style={[styles.oomBadge, { backgroundColor: colors.warning + "20" }]}>
                  <Feather name="award" size={10} color={colors.warning} />
                  <AppText variant="small" style={{ color: colors.warning }}>OOM</AppText>
                </View>
              )}
            </View>
          </View>

          <Feather name="chevron-right" size={20} color={colors.textTertiary} />
        </View>
      </AppCard>
    </Pressable>
  );

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
          <PrimaryButton
            onPress={() => router.push("/(app)/event/")}
            size="sm"
          >
            New Event
          </PrimaryButton>
        )}
      </View>

      {events.length === 0 ? (
        <EmptyState
          icon={<Feather name="calendar" size={24} color={colors.textTertiary} />}
          title="No Events Yet"
          message="Create your first event to start tracking results and scores."
          action={permissions.canCreateEvents ? {
            label: "Create Event",
            onPress: () => router.push("/(app)/event/"),
          } : undefined}
        />
      ) : (
        <>
          {/* Upcoming Events */}
          {upcomingEvents.length > 0 && (
            <View style={styles.section}>
              <AppText variant="h2" style={styles.sectionTitle}>
                Upcoming ({upcomingEvents.length})
              </AppText>
              {upcomingEvents.map(renderEventCard)}
            </View>
          )}

          {/* Completed Events */}
          {completedEvents.length > 0 && (
            <View style={styles.section}>
              <AppText variant="h2" style={styles.sectionTitle}>
                Completed ({completedEvents.length})
              </AppText>
              {completedEvents.map(renderEventCard)}
            </View>
          )}
        </>
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
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  eventCard: {
    marginBottom: spacing.xs,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dateBadge: {
    width: 50,
    height: 50,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  eventInfo: {
    flex: 1,
  },
  eventMeta: {
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
  oomBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
});
