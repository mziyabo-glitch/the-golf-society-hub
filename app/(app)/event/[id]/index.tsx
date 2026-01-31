import { useCallback, useState } from "react";
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
import { SocietyBadge } from "@/components/ui/SocietyHeader";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  getEvent,
  type EventDoc,
  EVENT_FORMATS,
  EVENT_CLASSIFICATIONS,
} from "@/lib/db_supabase/eventRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { societyId, society, userId, member: currentMember, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  // Get logo URL from society
  const logoUrl = (society as any)?.logo_url || (society as any)?.logoUrl || null;

  // Permissions for entering points (Captain/Handicapper)
  const permissions = getPermissionsForMember(currentMember as any);
  const canEnterPoints = permissions.canManageHandicaps;

  // Safely extract eventId (could be string or array from URL params)
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    if (!eventId || !societyId) {
      setError("Missing event or society");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getEvent(eventId);
      if (!data) {
        setError("Event not found");
      } else {
        setEvent(data);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load event");
    } finally {
      setLoading(false);
    }
  }, [eventId, societyId]);

  useFocusEffect(
    useCallback(() => {
      loadEvent();
    }, [loadEvent])
  );

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState message="Loading event..." />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <EmptyState title="Error" message={error} />
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState title="Not found" message="Event not available." />
      </Screen>
    );
  }

  const formatLabel =
    EVENT_FORMATS.find((f) => f.value === event.format)?.label ??
    event.format;

  const classificationLabel =
    EVENT_CLASSIFICATIONS.find((c) => c.value === event.classification)
      ?.label ?? event.classification;

  const handleOpenPoints = () => {
    if (!eventId) {
      console.error("[EventDetail] Cannot open points: eventId is undefined");
      return;
    }
    console.log("[EventDetail] opening points for event:", eventId);
    router.push({ pathname: "/(app)/event/[id]/points", params: { id: eventId } });
  };

  return (
    <Screen>
      {/* Header with Back and Society Badge */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <SocietyBadge
          societyName={society?.name || "Golf Society"}
          logoUrl={logoUrl}
          size="sm"
          showName={false}
        />
      </View>

      {/* Title */}
      <AppText variant="title" style={{ marginBottom: spacing.sm }}>
        {event.name}
      </AppText>

      {/* Details */}
      <AppCard style={styles.card}>
        <Row icon="calendar" label="Date" value={event.date ?? "TBC"} />
        <Row icon="map-pin" label="Course" value={event.courseName ?? "TBC"} />
        <Row icon="target" label="Format" value={formatLabel} />
        <Row icon="tag" label="Classification" value={classificationLabel} />
      </AppCard>

      {/* Tee Settings - only show if configured */}
      {(event.teeName || event.par != null || event.slopeRating != null) && (
        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
            Course / Tee Setup
          </AppText>
          {event.teeName && <Row icon="flag" label="Tee" value={event.teeName} />}
          {event.par != null && <Row icon="hash" label="Par" value={String(event.par)} />}
          {event.courseRating != null && (
            <Row icon="activity" label="Course Rating" value={String(event.courseRating)} />
          )}
          {event.slopeRating != null && (
            <Row icon="trending-up" label="Slope Rating" value={String(event.slopeRating)} />
          )}
          {event.handicapAllowance != null && (
            <Row
              icon="percent"
              label="Handicap Allowance"
              value={`${Math.round(event.handicapAllowance * 100)}%`}
            />
          )}
        </AppCard>
      )}

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
          <ActionRow
            icon="users"
            title="Players"
            subtitle={`${(event as any).player_ids?.length ?? event.playerIds?.length ?? 0} registered`}
          />
        </AppCard>
      </Pressable>

      {/* Enter Points Section - Captain/Handicapper only */}
      {canEnterPoints && (
        <Pressable
          onPress={handleOpenPoints}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
          <AppCard style={styles.actionCard}>
            <View style={styles.actionRow}>
              <View style={[styles.iconContainer, { backgroundColor: colors.warning + "20" }]}>
                <Feather name="edit-3" size={18} color={colors.warning} />
              </View>
              <View style={styles.actionContent}>
                <AppText variant="bodyBold">Enter Points</AppText>
                <AppText variant="caption" color="secondary">
                  Add Order of Merit points for players
                </AppText>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textTertiary} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* Created info */}
      {event.created_at && (
        <AppText variant="small" color="tertiary" style={styles.createdText}>
          Created {new Date(event.created_at).toLocaleDateString("en-GB")}
        </AppText>
      )}
    </Screen>
  );
}

/* ---------- Helpers ---------- */

function Row({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  const colors = getColors();
  return (
    <View style={styles.row}>
      <Feather name={icon} size={16} color={colors.primary} />
      <View style={{ marginLeft: spacing.sm }}>
        <AppText variant="caption">{label}</AppText>
        <AppText>{value}</AppText>
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
}: {
  icon: any;
  title: string;
  subtitle: string;
}) {
  const colors = getColors();
  return (
    <View style={styles.actionRow}>
      <Feather name={icon} size={18} color={colors.primary} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <AppText variant="bodyBold">{title}</AppText>
        <AppText variant="caption">{subtitle}</AppText>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textTertiary} />
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  actionCard: {
    marginBottom: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  actionContent: {
    flex: 1,
  },
  createdText: {
    marginTop: spacing.lg,
    textAlign: "center",
  },
});
