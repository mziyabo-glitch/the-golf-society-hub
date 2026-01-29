import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";

import { useBootstrap } from "@/lib/useBootstrap";
import {
  getEvent,
  type EventDoc,
  EVENT_FORMATS,
  EVENT_CLASSIFICATIONS,
} from "@/lib/db_supabase/eventRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { societyId, userId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (__DEV__) {
    console.log("[EventDetail] params:", params);
    console.log("[EventDetail] eventId:", eventId);
    console.log("[EventDetail] societyId:", societyId);
    console.log("[EventDetail] userId:", userId);
  }

  const loadEvent = useCallback(async () => {
    if (!eventId) {
      setError("Missing event id in route params");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getEvent(eventId);

      if (!data) {
        setError("Event not found (or blocked by permissions)");
        return;
      }

      setEvent(data);
    } catch (err: any) {
      console.error("[EventDetail] Load error:", err);

      const message = err?.message ?? "Failed to load event";
      const isPermissionError =
        message.includes("permission") ||
        message.includes("row-level security") ||
        err?.code === "42501";

      setError(
        isPermissionError
          ? "You don't have permission to view this event."
          : message
      );
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // Initial load
  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  // Refetch when screen regains focus (players / points updates)
  useFocusEffect(
    useCallback(() => {
      loadEvent();
    }, [loadEvent])
  );

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading event..." />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <HeaderBack router={router} colors={colors} />
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
        <HeaderBack router={router} colors={colors} />
        <EmptyState
          icon={<Feather name="calendar" size={24} color={colors.textTertiary} />}
          title="Event Not Found"
          message="This event may have been deleted or you don't have access."
          action={{ label: "Go Back", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const formatLabel =
    EVENT_FORMATS.find((f) => f.value === event.format)?.label ?? event.format;

  const classificationLabel =
    EVENT_CLASSIFICATIONS.find((c) => c.value === event.classification)?.label ??
    event.classification;

  const statusLabel = event.isCompleted
    ? "Completed"
    : event.status === "cancelled"
    ? "Cancelled"
    : event.status === "in_progress"
    ? "In Progress"
    : "Scheduled";

  const statusColor = event.isCompleted
    ? colors.success
    : event.status === "cancelled"
    ? colors.error
    : colors.primary;

  const formatDate = (date?: string) => {
    if (!date) return "TBC";
    return new Date(date).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <Screen>
      <HeaderBack router={router} colors={colors} />

      {/* Title */}
      <View style={styles.titleSection}>
        <AppText variant="title">{event.name}</AppText>

        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: statusColor + "20" }]}>
            <AppText variant="small" style={{ color: statusColor }}>
              {statusLabel}
            </AppText>
          </View>

          {event.classification === "oom" && (
            <View style={[styles.badge, { backgroundColor: colors.warning + "20" }]}>
              <Feather name="award" size={12} color={colors.warning} />
              <AppText variant="small" style={{ color: colors.warning, marginLeft: 4 }}>
                OOM
              </AppText>
            </View>
          )}
        </View>
      </View>

      {/* Details */}
      <AppCard style={styles.detailsCard}>
        <DetailRow icon="calendar" label="Date" value={formatDate(event.date)} />
        <DetailRow icon="map-pin" label="Course" value={event.courseName || "TBC"} />
        <DetailRow icon="target" label="Format" value={formatLabel} />
        <DetailRow icon="tag" label="Classification" value={classificationLabel} />
      </AppCard>

      {/* Players */}
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/(app)/event/[id]/players",
            params: { id: eventId },
          })
        }
      >
        <AppCard style={styles.actionCard}>
          <View style={styles.actionRow}>
            <Icon icon="users" colors={colors} />
            <View style={styles.actionContent}>
              <AppText variant="bodyBold">Players</AppText>
              <AppText variant="caption" color="secondary">
                {event.playerIds?.length ?? 0} registered
              </AppText>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>
    </Screen>
  );
}

/* ---------- Small helpers ---------- */

function HeaderBack({ router, colors }: any) {
  return (
    <View style={styles.header}>
      <SecondaryButton onPress={() => router.back()} size="sm">
        <Feather name="arrow-left" size={16} color={colors.text} />
        {" Back"}
      </SecondaryButton>
    </View>
  );
}

function Icon({ icon, colors }: any) {
  return (
    <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
      <Feather name={icon} size={18} color={colors.primary} />
    </View>
  );
}

function DetailRow({ icon, label, value }: any) {
  return (
    <View style={styles.detailRow}>
      <Icon icon={icon} />
      <View style={styles.detailContent}>
        <AppText variant="caption" color="secondary">
          {label}
        </AppText>
        <AppText variant="body">{value}</AppText>
      </View>
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { marginBottom: spacing.lg },
  titleSection: { marginBottom: spacing.lg },
  badgeRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  detailsCard: { marginBottom: spacing.lg },
  detailRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.base },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  detailContent: { flex: 1 },
  actionCard: { marginBottom: spacing.sm },
  actionRow: { flexDirection: "row", alignItems: "center" },
  actionContent: { flex: 1 },
});
