import { useEffect, useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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

  // Safely extract eventId (could be string or array from URL params)
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debug logging in development
  if (__DEV__) {
    console.log("[EventDetail] params:", params);
    console.log("[EventDetail] eventId:", eventId);
    console.log("[EventDetail] societyId:", societyId);
    console.log("[EventDetail] userId:", userId);
  }

  useEffect(() => {
    if (!eventId) {
      console.log("[EventDetail] No eventId, skipping load");
      setLoading(false);
      setError("No event ID provided");
      return;
    }

    const loadEvent = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log("[EventDetail] Fetching event:", eventId);
        const data = await getEvent(eventId);

        if (data) {
          console.log("[EventDetail] Event loaded:", data.name);
          setEvent(data);
        } else {
          console.log("[EventDetail] Event not found");
          setError("Event not found");
        }
      } catch (err: any) {
        console.error("[EventDetail] Load error:", err);

        // Handle permission/RLS errors
        const errorCode = err?.code || err?.statusCode;
        const errorMessage = err?.message || "";
        const is403 =
          errorCode === "403" ||
          errorCode === 403 ||
          errorCode === "42501" ||
          errorMessage.includes("permission") ||
          errorMessage.includes("row-level security");

        if (is403) {
          setError("You don't have permission to view this event.");
        } else {
          setError(err?.message || "Failed to load event");
        }
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [eventId]);

  // Loading state
  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading event..." />
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

  // Not found state
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
          message="This event may have been deleted or you don't have access."
          action={{
            label: "Go Back",
            onPress: () => router.back(),
          }}
        />
      </Screen>
    );
  }

  // Format helpers
  const formatLabel = EVENT_FORMATS.find((f) => f.value === event.format)?.label ?? event.format;
  const classificationLabel = EVENT_CLASSIFICATIONS.find((c) => c.value === event.classification)?.label ?? event.classification;

  const getStatusColor = () => {
    if (event.isCompleted) return colors.success;
    if (event.status === "cancelled") return colors.error;
    return colors.primary;
  };

  const getStatusLabel = () => {
    if (event.isCompleted) return "Completed";
    if (event.status === "cancelled") return "Cancelled";
    if (event.status === "in_progress") return "In Progress";
    return "Scheduled";
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "TBC";
    try {
      return new Date(dateStr).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Screen>
      {/* Header with back button */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} />
          {" Back"}
        </SecondaryButton>
      </View>

      {/* Event Title */}
      <View style={styles.titleSection}>
        <AppText variant="title">{event.name}</AppText>
        <View style={styles.badgeRow}>
          {/* Status badge */}
          <View style={[styles.badge, { backgroundColor: getStatusColor() + "20" }]}>
            <AppText variant="small" style={{ color: getStatusColor() }}>
              {getStatusLabel()}
            </AppText>
          </View>

          {/* OOM badge */}
          {event.classification === "oom" && (
            <View style={[styles.badge, { backgroundColor: colors.warning + "20" }]}>
              <Feather name="award" size={12} color={colors.warning} />
              <AppText variant="small" style={{ color: colors.warning, marginLeft: 4 }}>
                OOM
              </AppText>
            </View>
          )}

          {/* Major badge */}
          {event.classification === "major" && (
            <View style={[styles.badge, { backgroundColor: colors.info + "20" }]}>
              <Feather name="star" size={12} color={colors.info} />
              <AppText variant="small" style={{ color: colors.info, marginLeft: 4 }}>
                Major
              </AppText>
            </View>
          )}
        </View>
      </View>

      {/* Event Details Card */}
      <AppCard style={styles.detailsCard}>
        {/* Date */}
        <View style={styles.detailRow}>
          <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
            <Feather name="calendar" size={18} color={colors.primary} />
          </View>
          <View style={styles.detailContent}>
            <AppText variant="caption" color="secondary">Date</AppText>
            <AppText variant="body">{formatDate(event.date)}</AppText>
          </View>
        </View>

        {/* Course */}
        <View style={styles.detailRow}>
          <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
            <Feather name="map-pin" size={18} color={colors.primary} />
          </View>
          <View style={styles.detailContent}>
            <AppText variant="caption" color="secondary">Course</AppText>
            <AppText variant="body">{event.courseName || "TBC"}</AppText>
          </View>
        </View>

        {/* Format */}
        <View style={styles.detailRow}>
          <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
            <Feather name="target" size={18} color={colors.primary} />
          </View>
          <View style={styles.detailContent}>
            <AppText variant="caption" color="secondary">Format</AppText>
            <AppText variant="body">{formatLabel}</AppText>
          </View>
        </View>

        {/* Classification */}
        <View style={styles.detailRow}>
          <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
            <Feather name="tag" size={18} color={colors.primary} />
          </View>
          <View style={styles.detailContent}>
            <AppText variant="caption" color="secondary">Classification</AppText>
            <AppText variant="body">{classificationLabel}</AppText>
          </View>
        </View>

        {/* Winner (if completed) */}
        {event.isCompleted && event.winnerName && (
          <View style={styles.detailRow}>
            <View style={[styles.iconContainer, { backgroundColor: colors.success + "20" }]}>
              <Feather name="award" size={18} color={colors.success} />
            </View>
            <View style={styles.detailContent}>
              <AppText variant="caption" color="secondary">Winner</AppText>
              <AppText variant="body">{event.winnerName}</AppText>
            </View>
          </View>
        )}
      </AppCard>

      {/* Players Section */}
      <Pressable
        onPress={() => router.push(`/(app)/event/${eventId}/players`)}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        <AppCard style={styles.actionCard}>
          <View style={styles.actionRow}>
            <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="users" size={18} color={colors.primary} />
            </View>
            <View style={styles.actionContent}>
              <AppText variant="bodyBold">Players</AppText>
              <AppText variant="caption" color="secondary">
                {event.playerIds?.length ?? 0} player{(event.playerIds?.length ?? 0) !== 1 ? "s" : ""} registered
              </AppText>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      {/* Created info */}
      {event.created_at && (
        <AppText variant="small" color="tertiary" style={styles.createdText}>
          Created {new Date(event.created_at).toLocaleDateString("en-GB")}
        </AppText>
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
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  detailsCard: {
    marginBottom: spacing.lg,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.base,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  detailContent: {
    flex: 1,
  },
  actionCard: {
    marginBottom: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionContent: {
    flex: 1,
  },
  createdText: {
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
