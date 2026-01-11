import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { DestructiveButton, SecondaryButton } from "@/components/ui/Button";
import { getPermissions, type Permissions } from "@/lib/rbac";
import { getActiveSocietyId } from "@/lib/firebase";
import { deleteEvent, getEventById } from "@/lib/firestore/events";
import type { EventData } from "@/lib/models";
import { formatDateDDMMYYYY } from "@/utils/date";

export default function EventDetailScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Permissions | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const perms = await getPermissions();
        setPermissions(perms);

        const societyId = getActiveSocietyId();
        if (!societyId || !eventId) {
          setEvent(null);
          return;
        }

        const loaded = await getEventById(String(eventId), societyId);
        if (!loaded) {
          Alert.alert("Error", "Event not found", [{ text: "OK", onPress: () => router.replace("/society" as any) }]);
          return;
        }

        setEvent(loaded);
      } catch (err) {
        console.error("[Event] Load failed", err);
        Alert.alert("Error", "Failed to load event");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [eventId]);

  const confirmDelete = () => {
    Alert.alert(
      "Delete Event",
      "This will permanently delete this event. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Event",
          style: "destructive",
          onPress: handleDelete,
        },
      ]
    );
  };

  const handleDelete = async () => {
    if (!eventId) return;

    // ✅ Guard (don’t rely only on hiding the button)
    if (!permissions?.canManageEvents) {
      Alert.alert("Not allowed", "You don't have permission to delete events.");
      return;
    }

    try {
      const societyId = getActiveSocietyId();
      if (!societyId) {
        Alert.alert("Error", "No active society selected");
        return;
      }

      const result = await deleteEvent(String(eventId), societyId);
      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to delete event");
        return;
      }

      Alert.alert("Deleted", "Event has been deleted", [
        { text: "OK", onPress: () => router.replace("/society" as any) },
      ]);
    } catch (err) {
      console.error("[DeleteEvent] Failed", err);
      Alert.alert("Error", "Failed to delete event");
    }
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
          <AppText variant="body" color="secondary" style={{ marginTop: 6 }}>
            This event may have been deleted, or you may not have access.
          </AppText>
          <SecondaryButton onPress={() => router.replace("/society" as any)} style={{ marginTop: 16 }}>
            Back to Society
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
          <AppText>{formatDateDDMMYYYY(event.date)}</AppText>
          {event.courseName && <AppText>{event.courseName}</AppText>}
        </AppCard>

        <View style={{ marginTop: 16, gap: 12 }}>
          <SecondaryButton
            onPress={() =>
              router.push({ pathname: "/event/[id]/players", params: { id: event.id } } as any)
            }
          >
            Players
          </SecondaryButton>
          <SecondaryButton
            onPress={() =>
              router.push({ pathname: "/event/[id]/results", params: { id: event.id } } as any)
            }
          >
            Results
          </SecondaryButton>
          <SecondaryButton onPress={() => router.push("/tees-teesheet" as any)}>Tee Sheet</SecondaryButton>
        </View>

        {permissions?.canManageEvents && (
          <View style={{ marginTop: 24 }}>
            <DestructiveButton onPress={confirmDelete}>Delete Event</DestructiveButton>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
