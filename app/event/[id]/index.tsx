import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { DestructiveButton, SecondaryButton } from "@/components/ui/Button";
import { formatDateDDMMYYYY } from "@/utils/date";
import { getPermissions } from "@/lib/rbac";
import type { EventData } from "@/lib/models";
import { getEventById, deleteEvent } from "@/lib/firestore/events";
import { getActiveSocietyId } from "@/lib/firebase";

export default function EventDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = useMemo(() => (id ? String(id) : ""), [id]);

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventData | null>(null);
  const [canDelete, setCanDelete] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const perms = await getPermissions();
        setCanDelete(Boolean(perms.isCaptain || perms.canManageEvents));

        const societyId = getActiveSocietyId();
        if (!eventId || !societyId) {
          setEvent(null);
          return;
        }

        const loaded = await getEventById(eventId, societyId);
        setEvent(loaded);

        console.log("[EventDetails] Loaded event:", eventId);
      } catch (e) {
        console.error("[EventDetails] Load failed:", e);
        Alert.alert("Error", "Failed to load event");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [eventId]);

  const onDelete = () => {
    if (!eventId) return;

    Alert.alert("Delete Event", "This will permanently delete this event. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            console.log("[DeleteEvent] Deleting event:", eventId);
            const res = await deleteEvent(eventId);
            if (!res.success) {
              Alert.alert("Error", res.error || "Failed to delete event");
              return;
            }
            console.log("[DeleteEvent] Deleted OK:", eventId);
            router.replace("/society" as any);
          } catch (e) {
            console.error("[DeleteEvent] Failed:", e);
            Alert.alert("Error", "Failed to delete event");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen>
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <ActivityIndicator />
          <AppText style={{ marginTop: 12 }}>Loading event…</AppText>
        </View>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <AppCard>
          <AppText variant="h2">Event not found</AppText>
          <AppText variant="body" color="secondary" style={{ marginTop: 8 }}>
            This event may have been deleted, or you may not have access.
          </AppText>
          <SecondaryButton onPress={() => router.replace("/society" as any)} style={{ marginTop: 16 }}>
            Back
          </SecondaryButton>
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <AppCard>
          <AppText variant="title">{event.name}</AppText>
          <AppText variant="body" color="secondary" style={{ marginTop: 6 }}>
            {formatDateDDMMYYYY(event.date)}
          </AppText>
          {event.courseName ? (
            <AppText variant="body" color="secondary" style={{ marginTop: 6 }}>
              Course: {event.courseName}
            </AppText>
          ) : null}
          {event.format ? (
            <AppText variant="body" color="secondary" style={{ marginTop: 6 }}>
              Format: {event.format}
            </AppText>
          ) : null}
          {typeof (event as any).eventFee === "number" ? (
            <AppText variant="body" color="secondary" style={{ marginTop: 6 }}>
              Fee: £{(event as any).eventFee.toFixed(2)}
            </AppText>
          ) : null}
        </AppCard>

        <View style={{ marginTop: 16, gap: 12 }}>
          <SecondaryButton
            onPress={() =>
              router.push({ pathname: "/event/[id]/results", params: { id: event.id } } as any)
            }
          >
            Results
          </SecondaryButton>
          <SecondaryButton
            onPress={() =>
              router.push({ pathname: "/event/[id]/players", params: { id: event.id } } as any)
            }
          >
            Players
          </SecondaryButton>
        </View>

        {canDelete && (
          <View style={{ marginTop: 24 }}>
            <DestructiveButton onPress={onDelete}>Delete Event</DestructiveButton>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

